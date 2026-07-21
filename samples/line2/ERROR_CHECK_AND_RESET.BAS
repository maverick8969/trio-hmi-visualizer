manual_reset = 0
pgm_loop:
'GUARD on EtherCATStopped fix (Jan 2026): snapshot bit 0 BEFORE
'read_ethercat_status runs and restore it AFTER, so even if Motion Perfect
'silently aliased the `.ethercatstopped` references to bit 0 (instead of
'binding them to the new EtherCATStopped=6 constant), bit 0 is preserved
'against accidental side-effects from the EtherCAT state machine.  The
'dedicated estop set/clear paths below (lines 53, 89) still drive bit 0
'authoritatively.  Bench-verify by watching prev_estop_active vs
'systemstatus.estop_active during EtherCAT state transitions: if they
'always match, the constant resolved correctly and these three guard
'lines can be deleted.
prev_estop_active = systemstatus.estop_active
GOSUB read_ethercat_status
systemstatus.estop_active = prev_estop_active
IF WDOG THEN
    systemstatus.driveenabled = 1
ELSE
    systemstatus.driveenabled = 0
ENDIF
'Trap any Trio basic errors that might occur in this program
ON BASICERROR GOTO data_error_handler
'If not communications with flow meters and operator has pressed reset comms button ...
IF meter_comms_restart = 1 THEN GOSUB reset_meter_comms
GOSUB reset_safety_relay
'Zone parameter validation (per-zone independent speeds)
IF zone_control_enable = 1 THEN
    IF zone_end_distance_pct < 1 OR zone_end_distance_pct > 49 THEN
        zone_control_enable = 0
    ENDIF
    'Zone 1 traverse speed — split checks to avoid >= clamp fighting with user input
    IF zone1_traverse_speed <= 0 THEN
        zone1_traverse_speed = traverse_speed_setpt * 0.25
    ENDIF
    IF zone1_traverse_speed > traverse_speed_setpt THEN
        zone1_traverse_speed = traverse_speed_setpt
    ENDIF
    'Zone 3 traverse speed — independent from zone 1
    IF zone3_traverse_speed <= 0 THEN
        zone3_traverse_speed = traverse_speed_setpt * 0.25
    ENDIF
    IF zone3_traverse_speed > traverse_speed_setpt THEN
        zone3_traverse_speed = traverse_speed_setpt
    ENDIF
ENDIF
'Zone pump parameter validation (per-zone independent multipliers)
IF zone_pump_control_enable = 1 THEN
    'Pump zones need valid zone boundaries even without traverse speed control
    IF zone_end_distance_pct < 1 OR zone_end_distance_pct > 49 THEN
        zone_pump_control_enable = 0
    ENDIF
    IF zone1_pump_pct < 50 OR zone1_pump_pct > 200 THEN
        zone1_pump_pct = 120
    ENDIF
    IF zone2_pump_pct < 50 OR zone2_pump_pct > 200 THEN
        zone2_pump_pct = 80
    ENDIF
    IF zone3_pump_pct < 50 OR zone3_pump_pct > 200 THEN
        zone3_pump_pct = 120
    ENDIF
ENDIF
'Stop and reset on E-Stop
IF IN(in_safety_estop) = 0 AND WDOG = ON THEN
    triocontrolword_vr.autorunactive = 0
    systemstatus.estop_active = 1
    'systemstatus.ethercatstarting = 0
    'systemstatus.ethercatstarted = 0
    'Disable servo drives
    hmi_pumps_run = OFF
    manual_btn_pump_a = 0
    manual_btn_pump_b = 0
    manual_btn_pump_c = 0
    WDOG = OFF
    'Cancel all current and pending servo moves
    FOR axisno = axis_traverse TO axis_pump_c
        CANCEL(2) AXIS(axisno)
        WAIT LOADED
    NEXT axisno
    SET_BIT(nip_roll_status_running_bit, 5000)
    'Turn servoing off
    FOR axisno = axis_traverse TO axis_pump_c
        SERVO AXIS(axisno) = 0
    NEXT axisno
    'Clear homed and homing status bits
    traverse_statusword_vr.statusbithomed = 0
    traverse_statusword_vr.axisstatushoming = 0
    traverse_controlword_vr = 0
    'Drop out of auto mode and turn off auto sequence active flag
    triocontrolword_vr.automode = 0
    triocontrolword_vr.autorunactive = 0
    'Turn off all outputs except for nip (seperate e-stop and not on EtherCAT network)
    OP(0,16, FALSE)
    'Turn off EtherCat since going to restart and will know that ethercat state is 0 (not starting)
    'ETHERCAT($01,0)
'ELSEIF WDOG = 0 AND ((IN(in_safety_estop) = 1 AND systemstatus.ethercatstarted = 1) OR _
'        systemstatus.ethercatstopped = 1) THEN
ELSEIF WDOG = 0 AND IN(in_safety_estop) = 1 AND manual_reset = 1 THEN
'ELSEIF WDOG = 0 AND manual_reset = 1 AND ((IN(in_safety_estop) = 1 AND systemstatus.ethercatstarted = 1) OR _
    'systemstatus.ethercatstopped = 1) THEN
    manual_reset = 0
    systemstatus.estop_active = 0
    'Cancel moves just incase moves in buffer
    FOR axisno = axis_traverse TO axis_pump_c
        CANCEL(2) AXIS(axisno)
        'Wait causing app to sleep sometimes and not reset estop
        'WAIT LOADED
    NEXT axisno
    GOSUB read_ethercat_status
    'Restart EtherCAT (my not be required; test)
    'systemstatus.ethercatstarting = 1
    IF systemstatus.ethercatstarted = 0 THEN ETHERCAT(0,0)
    WA(200)
    'Check Trio AXISSTATUS for any error or conditions stopping an axis from running and reset
    FOR axisno = axis_traverse TO axis_pump_c
        IF AXISSTATUS AXIS(axisno) > 0 THEN
            DATUM(0)
            EXIT_LOOP
        ENDIF
    NEXT axisno
    WA(200)
    'Clear motor (M) status error
    FOR axisno = axis_traverse TO axis_pump_c
        BASE(axisno)
        'ETHERCAT($91,-1,999800)
        ETHERCAT($64, axisno)
    NEXT axisno
    WA(200)
    'If nip roll in fault state, reset
    IF nip_roll_status_word.nip_roll_status_fault_bit = TRUE THEN

        nip_roll_control_word.nip_roll_cntrl_fault_reset_bit = TRUE
        WA(500)
        nip_roll_control_word.nip_roll_cntrl_fault_reset_bit = FALSE
    ENDIF
    'systemstatus.ethercatstarting = 0
    'systemstatus.ethercatstarted = 1
    systemstatus.enablingdrives = 1
    'Enable each drive (have to use loop with BASE(x) since cannot use axis number after statement
    FOR axisno = axis_traverse TO axis_pump_c
        BASE(axisno)
        AXIS_ENABLE = ON
        WA(100)
    NEXT axisno
    'Enable drives (EtherCAT software enable)
    WDOG = ON
    WA(100)
    'Turn servoing on
    FOR axisno = axis_traverse TO axis_pump_c
        SERVO AXIS(axisno) = 1
    NEXT axisno
    'Drives are now fully enabled — clear the transient "enabling" flag so
    'systemstatus settles to {ethercatstarted, driveenabled} = 0x28 (40)
    'after a reset, mirroring the same hand-off pattern used in
    'INIT_PARAMETERS.BAS line 295.
    systemstatus.enablingdrives = 0
ENDIF
'Turn on or off servo drive enable (STO circuit) based on watchdog state
OP(out_watchdog, WDOG)
GOTO pgm_loop

reset_meter_comms:
meter_comms_restart = 0
IF PROC_STATUS PROC(proc_read_meters) <> 0 THEN STOP "READ_METERS"
WA(1000)
RUN "READ_METERS", proc_read_meters
WAIT UNTIL PROC_STATUS PROC(proc_read_meters) <> 0
RETURN

read_ethercat_status:
ETHERCAT($22,0,ethercat_state_vr)
IF ethercat_state_vr = ethercat_stopped THEN
    systemstatus.ethercatstopped = 1
    systemstatus.ethercatstarting = 0
    systemstatus.ethercatstarted = 0
ENDIF
IF ethercat_state_vr = ethercat_preop OR ethercat_state_vr = ethercat_safeop THEN
    systemstatus.ethercatstopped = 0
    systemstatus.ethercatstarting = 1
    systemstatus.ethercatstarted = 0
ENDIF
IF ethercat_state_vr = ethercat_op THEN
    systemstatus.ethercatstopped = 0
    systemstatus.ethercatstarting = 0
    systemstatus.ethercatstarted = 1
ENDIF
RETURN

reset_safety_relay:
'If main screen safety relay triggered, send 3 second pulse to relay which has a timer dial set to 1.5 second reset
IF safety_relay_reset = 1 THEN
    safety_relay_reset = 0
    OP(out_estop_reset, ON)
    WA(3000)
    OP(out_estop_reset, OFF)
    'Trigger drives manual reset to restart ethercat
    manual_reset = 1
ENDIF
RETURN

'Handle any errors in above code
data_error_handler:
trio_program_error = RUN_ERROR PROC(PROCNUMBER)
program_error_lineno = ERROR_LINE PROC(PROCNUMBER)
PRINT #debugport, "ERROR_CHECK_AND_RESET error # "; trio_program_error
WA(10)
PRINT #debugport, " at line "; program_error_lineno
WA(10)
STOP
RETURN

