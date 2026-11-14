'Dashboard data publisher — runs as Proc_Share_Data (17)
'Stages a contiguous block of VRs (4000-4023) every Share_Data_Period_ms
'so an external Modbus TCP poller (e.g. shop-floor KPI Grafana) can pull
'all dashboard state in a single FC03 read.  See
'Docs/Modbus_TCP_Integration.md "Dashboard SHARE_DATA Block" for the
'layout and the HI-first / poller double-read protocol used to dodge
'torn 32-bit reads.
'
'Read-only against motion: never calls MOVE/WAIT IDLE — only reads VRs,
'MTYPE, MSPEED and writes to the share block.  Uses WA() to yield to the
'scheduler between cycles instead of a TICKS busy-loop.

WA(2000) 'Let init settle

pgm_loop:
    'Shift_Start_Reset listener (shared between Outage Recovery §7.1 and
    'Material Reporting Restoration §6.3 / Phase 3).  The KPI poller
    'FC16-writes VR 4028 = 1 on every active_shift transition.  Handling
    'lives here in SHARE_DATA (not NIP_ROLL) so a NIP_ROLL fault does
    'NOT prevent the ack -- the existing product_length_reset flag is
    'picked up by NIP_ROLL.BAS:product_length_calc on its own next tick.
    'Atomically clears BOTH targets and acks by zeroing VR 4028 so the
    'poller can confirm completion via read-back.
    IF shift_start_reset = 1 THEN
        last_anchor_length = 0 'matches the reset that's about to land
        product_length_reset = 1 'NIP_ROLL clears product_length next tick
        startup_material_g_x100 = 0 'Material plan: shift-scoped accumulator
        startup_active_s = 0 'Material plan: shift-scoped duration
        pumpa_soft_total_x100 = 0 'Soft totalizer: clear at every shift boundary
        pumpb_soft_total_x100 = 0
        shift_start_reset = 0 'ack to poller
    ENDIF

    'Bit-packed line state at VR 4000
    line_state = 0
    IF READ_BIT(nip_roll_status_running_bit, 5000) THEN line_state = line_state + 1
    IF MTYPE AXIS(axis_traverse) <> mtype_idle THEN line_state = line_state + 2
    IF MTYPE AXIS(axis_pump_a) <> mtype_idle THEN line_state = line_state + 4
    IF MTYPE AXIS(axis_pump_b) <> mtype_idle THEN line_state = line_state + 8
    IF triocontrolword_vr.automode = 1 THEN line_state = line_state + 16
    share_line_state = line_state

    'Single-bit "actually producing" flag — same three-way AND used in
    'NIP_ROLL.BAS:64 to gate footage accumulation
    IF READ_BIT(nip_roll_status_running_bit, 5000) AND _
            MTYPE AXIS(axis_traverse) <> mtype_idle AND _
            MTYPE AXIS(axis_pump_a) <> mtype_idle THEN
        share_system_running = 1
    ELSE
        share_system_running = 0
    ENDIF

    'Product_length (feet) -> int(feet * 100), HI written first so a poller
    'catching mid-update sees a slightly stale value, never a torn high one
    length_x100 = product_length * 100
    share_length_hi = INT(length_x100 / 65536)
    share_length_lo = length_x100 - share_length_hi * 65536

    'Live speeds (each * 10 to preserve one decimal as integer)
    share_nip_speed_x10 = MSPEED AXIS(axis_niproll) * 10
    share_traverse_speed_x10 = MSPEED AXIS(axis_traverse) * 10
    share_pumpa_rpm_x10 = MSPEED AXIS(axis_pump_a) * 10
    share_pumpb_rpm_x10 = MSPEED AXIS(axis_pump_b) * 10

    'Linear belt rate ft/min * 10 (nip_speed_setpt is in/min)
    share_nip_ftpermin_x10 = (nip_speed_setpt / 12) * 10

    'Flow meter passthrough — already integers with implied 2 decimals
    share_pumpa_flow = pumpa_meter_mass_flow_gpersec
    share_pumpb_flow = pumpb_meter_mass_flow_gpersec

    'Startup material accumulator (Material Reporting Restoration Phase 3).
    'When pumps are moving but traverse and nip are NOT, we're in the
    '"pour into bucket" startup state.  Reuse the same boolean expressions
    'that build line_state above so the displayed line-state pills (see
    'Line_State_Bit_Decode.md) and the accumulator gate can never drift apart.
    'Both flow rates are published at *100 (implied 2 decimals = g/s); * 2 s
    'gives g*200, so we keep the accumulator at *100 scale to avoid integer
    'truncation (~0.5 g/tick saved over ~14000 ticks/shift).  Zeroed by the
    'Shift_Start_Reset listener at every shift boundary; resets on Trio
    'reboot are tolerable -- the dashboard tile starts fresh from the next
    'shift's first startup event.
    IF (MTYPE AXIS(axis_pump_a) <> mtype_idle OR _
        MTYPE AXIS(axis_pump_b) <> mtype_idle) AND _
            MTYPE AXIS(axis_traverse) = mtype_idle AND _
            NOT READ_BIT(nip_roll_status_running_bit, 5000) THEN
        startup_material_g_x100 = startup_material_g_x100 + _
            (pumpa_meter_mass_flow_gpersec + pumpb_meter_mass_flow_gpersec) * 2
        startup_active_s = startup_active_s + 2
    ENDIF
    'Publish to VR 4026 / 4027 every cycle.  Poller reads, server writes
    'kpi_current.startup_material_g; manager dashboard "Startup Material"
    'tile binds to that column.
    share_startup_material_g = INT(startup_material_g_x100 / 100)
    share_startup_active_s = startup_active_s

    'Mix ratio actual + setpoint (* 10000 to preserve four decimals as integer)
    share_ratio_actual_x10000 = pumpb_actual_short_ave_ratio * 10000
    share_ratio_sp_x10000 = pumpb_mix_ratio * 10000

    'Mass totalizers (HI-first) — soft integration replacing the hardware
    'totalizer at register 10.  The new Emerson meters (swapped 5/12/2025)
    'publish a 16-bit unsigned totalizer in grams (max 65 535 g = 65.5 kg)
    'that wraps every ~91 min at Pump A flow rates and is sign-corrupted by
    'Trio when the unsigned value exceeds 32767 — both make it unusable for
    'shift tracking.  Soft integration avoids both issues.
    '
    'pumpa_meter_mass_flow_gpersec carries an implied x100 scale (e.g. 1200
    '= 12.00 g/s).  Multiplying by 2 (s/tick) gives grams×100; dividing once
    'at publish time avoids per-tick truncation loss (~0.5 g/tick).
    '
    'Gate conditions (mirror Line 1 KPI_SHARE.BAS commit c21973b):
    '  read_error = 0  — stalled meter keeps last stale reading; skip it
    '  flow > 0        — rejects idle / sentinel readings
    '  MTYPE <> idle   — rejects phantom residual flow when pump is stopped
    IF pumpa_meter_modbus_read_error = 0 AND pumpa_meter_mass_flow_gpersec > 0 AND _
            MTYPE AXIS(axis_pump_a) <> mtype_idle THEN
        pumpa_soft_total_x100 = pumpa_soft_total_x100 + pumpa_meter_mass_flow_gpersec * 2
    ENDIF
    IF pumpb_meter_modbus_read_error = 0 AND pumpb_meter_mass_flow_gpersec > 0 AND _
            MTYPE AXIS(axis_pump_b) <> mtype_idle THEN
        pumpb_soft_total_x100 = pumpb_soft_total_x100 + pumpb_meter_mass_flow_gpersec * 2
    ENDIF
    pumpa_soft_total_g = INT(pumpa_soft_total_x100 / 100)
    pumpb_soft_total_g = INT(pumpb_soft_total_x100 / 100)
    share_pumpa_total_hi = INT(pumpa_soft_total_g / 65536)
    share_pumpa_total_lo = pumpa_soft_total_g - share_pumpa_total_hi * 65536
    share_pumpb_total_hi = INT(pumpb_soft_total_g / 65536)
    share_pumpb_total_lo = pumpb_soft_total_g - share_pumpb_total_hi * 65536

    'Misc passthrough
    share_recipe = recipe_no
    share_systemstatus = systemstatus
    share_pumpa_errors = pumpa_meter_error_count
    share_pumpb_errors = pumpb_meter_error_count

    'Production uptime (HI-first)
    share_uptime_hi = INT(production_seconds / 65536)
    share_uptime_lo = production_seconds - share_uptime_hi * 65536

    'Outage Recovery §7.1 anchor echo (VR 4029).  last_anchor_length is
    'set to 0 in the Shift_Start_Reset handler above; publishing it as
    'x100 lets the server read VR 4029, divide by 100, and confirm the
    'reset acked (should match the anchor_length_in the server just
    'wrote to shift_anchors).  Always-on publish so the value stays
    'current; a stale VR 4029 != 0 would indicate a missed reset cycle.
    share_last_anchor_x100 = INT(last_anchor_length * 100)

    'Inverse of operator_shift_done — 1 when shift is active, 0 when ended.
    'Used by HMI Visible binding on ButtonShiftActive (OPERATOR_MAIN.TGD) so
    'the orange END SHIFT button hides when VR 4024 is set.  Kept here so any
    'auto-clear of VR 4024 (poll.py shift-start, NIP_ROLL length reset) is
    'reflected within one 2 s publish cycle without extra HMI button logic.
    shift_active_display = 1 - operator_shift_done

    'End Shift button visibility (VR 4058) — anti-accidental-press gate.
    'ButtonShiftActive.Visible is bound to this VR (NOT VR 4025 directly), so
    'the orange END SHIFT button HIDES whenever any of nip/traverse/pumpA/
    'pumpB is non-idle.  Operator must stop the line before the button reappears,
    'making an accidental mid-run press structurally impossible.  PumpC ratio-
    'follows PumpA so PumpA idle → PumpC idle (no separate check needed).
    'share_line_state bits: 1=nip, 2=traverse, 4=pumpA, 8=pumpB; mask = 15.
    IF shift_active_display = 1 AND (share_line_state AND 15) = 0 THEN
        end_shift_button_visible = 1
    ELSE
        end_shift_button_visible = 0
    ENDIF

    'Heartbeat last — poller treats Trio as stale if this stops moving even
    'when the TCP socket is up.  Wraps within signed 16-bit range.
    share_heartbeat = share_heartbeat + 1
    IF share_heartbeat > 32767 THEN share_heartbeat = 0

    'Hardcoded 2000 ms (was: WA(share_data_period_ms) referencing the
    'Share_Data_Period_ms CONSTANT in START_AND_SET_VARIABLES.BAS:892).
    'Observed wedge after poller restart: SHARE_DATA parked here at 0% CPU
    'with heartbeat frozen, only recoverable via Trio reboot.
    'PROC_STATUS = Run, RUN_ERROR PROC(17) = 0 -- the process was simply
    'not getting scheduled out of this WA().  Hypothesis: the lowercase
    'reference didn't resolve to the (capitalized) CONSTANT, so the call
    'effectively became WA(0), which Trio firmware can interpret as
    '"wait for explicit event" rather than "wait 0 ms".  Hardcoding the
    'literal removes the lookup fragility entirely.  2000 ms matches the
    'documented cadence (Docs/Modbus_TCP_Integration.md "Dashboard
    'SHARE_DATA Block" -- intentionally slow vs the dashboard's 10-30 s
    'poll; gives healthy oversampling without BASIC-scheduler load).
    WA(2000)
GOTO pgm_loop
