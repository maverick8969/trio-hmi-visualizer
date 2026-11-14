pump_increment = .5
kicker = TRUE
starting_pump = FALSE
pump_was_off = TRUE
pump_loop:
IF kicker THEN
    BASE(axis_pump_c)
    'Will be turned off where A pump increase/decrease is set by nip change
    IF pumpa_adjust_to_nip_change = TRUE THEN
        kicker_pump_speed_setpoint = kicker_pump_speed_setpoint * nip_percent_speed_change
    ENDIF
    SPEED = kicker_pump_speed_setpoint
    'Apply zone pump multiplier to kicker (same percentages as Pump A)
    IF zone_pump_control_enable = 1 THEN
        IF zone_current = 1 THEN
            SPEED = SPEED * (zone1_pump_pct / 100)
        ELSEIF zone_current = 2 THEN
            SPEED = SPEED * (zone2_pump_pct / 100)
        ELSEIF zone_current = 3 THEN
            SPEED = SPEED * (zone3_pump_pct / 100)
        ENDIF
    ENDIF
    ACCEL = SPEED * 2
    DECEL = SPEED * 2
ENDIF
'If pump_switch_overide is on and pump switch turned from off, turn off override
running_calibration = running_pumpa_calibration = 1 OR running_pumpb_calibration = 1 OR _
    running_pumpc_calibration = 1
IF running_calibration OR hmi_pumps_run OR triocontrolword_vr.automode <> 0 THEN
    VR(pump_switch_override) = 0
ELSE
    VR(pump_switch_override) = 1
ENDIF
IF hmi_pumps_run AND running_calibration = FALSE THEN
    '1-shot for setting initial pump speeds before pump PID control
    IF pump_was_off THEN starting_pump = TRUE
    GOSUB traverse_speed_ratio
    IF use_flow_meters AND starting_pump = TRUE THEN GOSUB pumpb_init_speed
    GOSUB pump_speeds_per_calibration
    GOSUB run_pumps
    starting_pump = FALSE
    pump_was_off = FALSE
ELSEIF hmi_pumps_run = OFF AND running_calibration = FALSE AND triocontrolword_vr.automode = 0 _
        AND VR(pump_switch_override) = 1 THEN
    'pumpa_speed_pid_auto = FALSE
    'pumpb_speed_pid_auto = FALSE
    pump_was_off = TRUE
    starting_pump = FALSE
    GOSUB run_pumps_manual_buttons
ENDIF
IF pumpa_adjust_to_nip_change = TRUE THEN pumpa_adjust_to_nip_change = FALSE
IF kicker THEN GOSUB run_kicker

IF hmi_pumps_run = FALSE AND running_calibration = FALSE AND VR(pump_switch_override) = 0 THEN
    IF MTYPE AXIS(axis_pump_a) <> mtype_idle AND running_pumpa_calibration = 0 THEN
        CANCEL(2) AXIS(axis_pump_a)
        CANCEL(2) AXIS(axis_pump_a)
    ENDIF
    IF MTYPE AXIS(axis_pump_b) <> mtype_idle AND running_pumpb_calibration = 0 THEN
        CANCEL(2) AXIS(axis_pump_b)
        CANCEL(2) AXIS(axis_pump_b)
    ENDIF
    IF kicker = FALSE THEN
        IF MTYPE AXIS(axis_pump_c) <> mtype_idle AND running_pumpc_calibration = 0 THEN
            CANCEL(2) AXIS(axis_pump_c)
            CANCEL(2) AXIS(axis_pump_c)
        ENDIF
    ENDIF
ENDIF
GOSUB purge
GOSUB pump_status
GOTO pump_loop

traverse_speed_ratio:
IF traverse_speed_setpt > 0 AND ABS(MSPEED AXIS(axis_traverse)) > 0 THEN
    traverse_actual_to_setpt_speed = ABS(MSPEED AXIS(axis_traverse) / traverse_speed_setpt)
    IF (traverse_actual_to_setpt_speed * 100) < traverse_to_pump_min THEN _
            traverse_actual_to_setpt_speed = traverse_to_pump_min / 100
ELSE
    traverse_actual_to_setpt_speed = 1
ENDIF
RETURN

pump_speeds_per_calibration:
'Pump A speed is set to gallons/hour (or minutes; not sure yet).
'Gallons per hour is calculated based on the pump calibration (weighed grams/pump revolution)
'and the material volume (grams/cm3).  There are 3785.412 cm3/gallon, so the rate of
'gallons per minute or hour can be calculated base on the pump speed.

'Check if pumps sync'd to nip roll is set and nip speed setpoint has changed
'If so, adjust the cm3/Gal setpoint that controls pump A speed.
IF pumpa_adjust_to_nip_change = TRUE THEN
    pumpa_adjust_to_nip_change = FALSE
    pumpa_gramspercm3 = pumpa_gramspercm3 * nip_percent_speed_change
    pumpa_rpm_setpoint = pumpa_rpm_setpoint * nip_percent_speed_change
ENDIF
IF pumpa_gramspercm3 > 0 THEN
    pumpa_cm3_per_rev = VR(pumpa_actual_grams_per_rev_vr) / pumpa_gramspercm3
    IF cm3pergallon > 0 THEN pumpa_gallons_per_rev = pumpa_cm3_per_rev / cm3pergallon
ENDIF
'This is for reference only should want to set actual specific weight of pump B and C
'material to get calculated flow
IF pumpb_gramspercm3 > 0 THEN
    pumpb_cm3_per_rev = VR(pumpb_actual_grams_per_rev_vr) / pumpb_gramspercm3
    IF cm3pergallon > 0 THEN pumpb_gallons_per_rev = pumpb_cm3_per_rev / cm3pergallon
ENDIF
IF pumpc_gramspercm3 > 0 THEN
    pumpc_c3_per_rev = VR(pumpc_actual_grams_per_rev_vr) / pumpc_gramspercm3
    IF cm3pergallon > 0 THEN pumpc_gallons_per_rev = pumpc_c3_per_rev / cm3pergallon
ENDIF

'B & C pump ratio to A based on calibration weights from each pump (A grams/ B grams and A grams / C grams)
'The result is the speed required for pump B or C to run to output the weight equal to pump A which is then
'multiplied by the required ratio to run pump B or C speed proportionally to pump A

'b_to_a_pumping_ratio = pumpa_gallons_per_rev / pumpb_gallons_per_rev
IF VR(pumpb_actual_grams_per_rev_vr) > 0 THEN b_to_a_pumping_ratio = VR(pumpa_actual_grams_per_rev_vr) / _
        VR(pumpb_actual_grams_per_rev_vr)
'C pump ratio to A pump volume ratio to get equal flow
'IF pumpc_gramspercm3 > 0 THEN c_to_a_pumping_ratio = pumpa_gallons_per_rev / pumpc_gallons_per_rev
IF VR(pumpc_actual_grams_per_rev_vr) > 0 THEN c_to_a_pumping_ratio = VR(pumpa_actual_grams_per_rev_vr) / _
        VR(pumpc_actual_grams_per_rev_vr)
'================= NOTE THAT pumpa_rpm_setpoint IS NOW RPM ====================
IF pumpa_rpm_setpoint > 0 THEN SPEED AXIS(axis_pump_a) = (pumpa_rpm_setpoint)
 '   IF pumpa_gallons_per_rev > 0 THEN SPEED AXIS(axis_pump_a) = _
 '           ((pumpa_rpm_setpoint / pumpa_gallons_per_rev))
'Run pump A proportional to traverse speed if sync enabled
IF sync_pumpa_with_traverse THEN SPEED AXIS(axis_pump_a) = SPEED AXIS(axis_pump_a) * _
        traverse_actual_to_setpt_speed
'Apply zone-based pump speed multiplier (each zone independent)
IF zone_pump_control_enable = 1 THEN
    IF zone_current = 1 THEN
        'Zone 1 (departure) — apply zone 1 pump percentage
        SPEED AXIS(axis_pump_a) = SPEED AXIS(axis_pump_a) * (zone1_pump_pct / 100)
    ELSEIF zone_current = 2 THEN
        'Zone 2 (center) — apply zone 2 pump percentage
        SPEED AXIS(axis_pump_a) = SPEED AXIS(axis_pump_a) * (zone2_pump_pct / 100)
    ELSEIF zone_current = 3 THEN
        'Zone 3 (arrival) — apply zone 3 pump percentage
        SPEED AXIS(axis_pump_a) = SPEED AXIS(axis_pump_a) * (zone3_pump_pct / 100)
    ENDIF
ENDIF
IF use_flow_meters = FALSE THEN
'Set pump B speed based on pump B material to pump A material ratio setpoint
    IF VR(pumpb_actual_grams_per_rev_vr) > 0 AND MSPEED AXIS(axis_pump_a) > 0 THEN SPEED AXIS(axis_pump_b) = _
            MSPEED AXIS(axis_pump_a) * (b_to_a_pumping_ratio * pumpb_mix_ratio)
ELSE

ENDIF
'IF VR(pumpb_actual_grams_per_rev_vr) > 0 THEN SPEED AXIS(axis_pump_b) = (b_to_a_pumping_ratio * pumpb_mix_ratio)
'Run pump B proportional to traverse speed if sync enabled
'IF sync_pumpa_with_traverse THEN SPEED AXIS(axis_pump_b) = SPEED AXIS(axis_pump_b) * traverse_actual_to_setpt_speed
'Do same for pump C as for pump B
IF kicker = FALSE THEN
    IF pumpc_gallons_per_rev > 0 THEN SPEED AXIS(axis_pump_c) = _
            MSPEED AXIS(axis_pump_a) * (c_to_a_pumping_ratio * pumpc_mix_ratio)
ENDIF
'IF pumpc_gallons_per_rev > 0 THEN SPEED AXIS(axis_pump_c) = (c_to_a_pumping_ratio * pumpc_mix_ratio)
'IF sync_pumpa_with_traverse THEN SPEED AXIS(axis_pump_c) = SPEED AXIS(axis_pump_c) * _
'        traverse_actual_to_setpt_speed
BASE(axis_pump_a)
IF SPEED > 0 THEN ACCEL = SPEED * 2
IF SPEED > 0 THEN DECEL = SPEED * 2
BASE(axis_pump_b)
IF SPEED > 0 THEN ACCEL = SPEED * 2
IF SPEED > 0 THEN DECEL = SPEED * 2
IF kicker = FALSE THEN
    BASE(axis_pump_c)
    IF SPEED > 0 THEN ACCEL = SPEED * 2
    IF SPEED > 0 THEN DECEL = SPEED * 2
ENDIF
'Pump speed increment/decrement
IF pump_speed_decrement THEN
    pump_speed_decrement = FALSE
    pumpa_rpm_setpoint = pumpa_rpm_setpoint - pump_increment
    IF pumpa_rpm_setpoint < 0 THEN pumpa_rpm_setpoint = 0
    WA(1000)
ENDIF
IF pump_speed_increment THEN
    pump_speed_increment = FALSE
    pumpa_rpm_setpoint = pumpa_rpm_setpoint + pump_increment
    IF pumpa_rpm_setpoint > 100 THEN pumpa_rpm_setpoint = 100
    WA(1000)
ENDIF
RETURN

pumpb_init_speed:
'If starting, set pump A speed based on user gal/hr setting and calibrated RPM/Gal/Hr and
'set pump B speed based on user flow ratio to pump A RPM/grams/sec
starting_pump = FALSE
'SPEED AXIS(axis_pump_a) = pumpa_initial_pid_speed
SPEED AXIS(axis_pump_b) = pumpb_initial_pid_speed
'pumpa_speed_pid_auto = TRUE
'pumpb_speed_pid_auto = TRUE
RETURN

run_pumps:
IF hmi_pumps_run AND MTYPE AXIS(axis_pump_a) = mtype_idle THEN
    FORWARD AXIS(axis_pump_a)
    IF pumpb_mix_ratio > 0 THEN
        FORWARD AXIS(axis_pump_b)
    ENDIF
    IF kicker = FALSE THEN
        IF pumpc_mix_ratio > 0 THEN
            FORWARD AXIS(axis_pump_c)
        ENDIF
    ENDIF
ENDIF
RETURN

run_pumps_manual_buttons:
IF manual_btn_pump_a = 1 THEN
    manual_btn_pump_a = 0
    IF MTYPE AXIS(axis_pump_a) = mtype_idle THEN
        FORWARD AXIS(axis_pump_a)
    ELSE
        CANCEL(2) AXIS(axis_pump_a)
    ENDIF
ENDIF

IF manual_btn_pump_b = 1 THEN
    manual_btn_pump_b = 0
    IF MTYPE AXIS(axis_pump_b) = mtype_idle THEN
        FORWARD AXIS(axis_pump_b)
    ELSE
        CANCEL(2) AXIS(axis_pump_b)
    ENDIF
ENDIF
IF kicker = FALSE THEN
    IF manual_btn_pump_c = 1 THEN
        manual_btn_pump_c = 0
        IF MTYPE AXIS(axis_pump_c) = mtype_idle THEN
            FORWARD AXIS(axis_pump_c)
        ELSE
            CANCEL(2) AXIS(axis_pump_c)
        ENDIF
    ENDIF
ENDIF
RETURN

run_kicker:
IF manual_btn_pump_c = 1 THEN
    manual_btn_pump_c = 0
    IF MTYPE AXIS(axis_pump_c) = mtype_idle THEN
        FORWARD AXIS(axis_pump_c)
    ELSE
        CANCEL(2) AXIS(axis_pump_c)
    ENDIF
ENDIF
RETURN

pump_status:
IF MTYPE AXIS(axis_pump_a) <> mtype_idle THEN
    pumpa_green = 1
ELSE
    pumpa_green = 0
ENDIF
IF MTYPE AXIS(axis_pump_b) <> mtype_idle THEN
    pumpab_green = 1
ELSE
    pumpb_green = 0
ENDIF
IF MTYPE AXIS(axis_pump_c) <> mtype_idle THEN
    pumpc_green = 1
ELSE
    pumpac_green = 0
ENDIF

pumpa_actual_gph_vr = MSPEED AXIS(axis_pump_a) * pumpa_gallons_per_rev
pumpb_actual_gph_vr = MSPEED AXIS(axis_pump_b) * pumpb_gallons_per_rev
pumpc_actual_gph_vr = MSPEED AXIS(axis_pump_c) * pumpc_gallons_per_rev
RETURN

purge:
IF hmi_purge AND MTYPE AXIS(axis_pump_a) = mtype_idle AND _
        MPOS AXIS(axis_traverse) < 1 AND traverse_statusword_vr.statusbithomed = 1 THEN
    OP(out_pumpspurgesol1, ON)
    OP(out_pumpspurgesol2, ON)
ELSE
    OP(out_pumpspurgesol1, OFF)
    OP(out_pumpspurgesol2, OFF)
ENDIF
RETURN

