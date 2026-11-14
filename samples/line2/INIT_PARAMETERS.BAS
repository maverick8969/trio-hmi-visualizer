have_meters = TRUE


'Load part parameters from table flash memory page 1 to table memory page 0
'if contents in flash table page 1 (IF FLASHTABLE(3,1)).
'Pages are zero indexed with 16000 memory locations (value storage)
IF FLASHTABLE(3,1) THEN
    FLASHTABLE(2,1,0)
ENDIF
'Initialize zone control defaults in TABLE for new columns (positions 160-219)
'Column 8 (pos 160-179) = zone_control_enable, default 0
'Column 9 (pos 180-199) = zone_end_distance_pct, default 15
'Column 10 (pos 200-219) = zone1_traverse_speed, default 5
FOR ri = 0 TO 19
    'Validate zone_control_enable is 0 or 1 — fix invalid values (e.g. -1 from flash)
    IF TABLE(160 + ri) <> 0 AND TABLE(160 + ri) <> 1 THEN
        TABLE(160 + ri, 0)
    ENDIF
    IF TABLE(180 + ri) = 0 AND TABLE(200 + ri) = 0 THEN
        TABLE(180 + ri, 15)
        TABLE(200 + ri, 5)
    ENDIF
NEXT ri
'Initialize zone pump control defaults in TABLE (positions 220-279)
'Column 11 (pos 220-239) = zone_pump_control_enable, default 0
'Column 12 (pos 240-259) = zone1_pump_pct, default 120
'Column 13 (pos 260-279) = zone2_pump_pct, default 80
FOR ri = 0 TO 19
    'Validate zone_pump_control_enable is 0 or 1 — fix invalid values
    IF TABLE(220 + ri) <> 0 AND TABLE(220 + ri) <> 1 THEN
        TABLE(220 + ri, 0)
    ENDIF
    IF TABLE(240 + ri) = 0 AND TABLE(260 + ri) = 0 THEN
        TABLE(240 + ri, 120)
        TABLE(260 + ri, 80)
    ENDIF
NEXT ri
'Initialize zone 3 independent defaults in TABLE (positions 280-319)
'Column 14 (pos 280-299) = zone3_traverse_speed, default 5
'Column 15 (pos 300-319) = zone3_pump_pct, default 120
FOR ri = 0 TO 19
    IF TABLE(280 + ri) = 0 AND TABLE(300 + ri) = 0 THEN
        TABLE(280 + ri, 5)
        TABLE(300 + ri, 120)
    ENDIF
NEXT ri
'Turn off Trio enable and disable servoing and enable
WDOG = 0
FOR indx = axis_traverse TO axis_pump_c
    SERVO AXIS(indx) = 0
NEXT indx

'Stop any running programs
IF PROC_STATUS PROC(proc_thermocouple_config) > 0 THEN STOP "CONFIG_THERMOCOUPLES"
IF PROC_STATUS PROC(proc_error_check) > 0 THEN STOP "ERROR_CHECK_AND_RESET"
IF PROC_STATUS PROC(proc_recipes) > 0 THEN STOP "RECIPES"
IF PROC_STATUS PROC(proc_hmi_animation) > 0 THEN STOP "HMI_ANIMATION"
IF PROC_STATUS PROC(proc_nip_roll) > 0 THEN STOP "NIP_ROLL"
IF PROC_STATUS PROC(proc_traverse) > 0 THEN STOP "TRAVERSE"
IF PROC_STATUS PROC(proc_manual) > 0 THEN STOP "MANUAL"
IF PROC_STATUS PROC(proc_calibration) <> 0 THEN STOP "CALIBRATION"
IF PROC_STATUS PROC(proc_pumps_run) <> 0 THEN STOP "PUMPS_RUN"
IF PROC_STATUS PROC(proc_mixer) <> 0 THEN STOP "MIXER"
IF PROC_STATUS PROC(proc_heater_offon) <> 0 THEN STOP "HEATER_OFFON_CONTROL"
IF PROC_STATUS PROC(proc_adisra_data) <> 0 THEN STOP "ADISRA_DATA"
IF PROC_STATUS PROC(proc_share_data) <> 0 THEN STOP "SHARE_DATA"
IF have_meters THEN
    IF PROC_STATUS PROC(proc_read_meters) <> 0 THEN STOP "READ_METERS"
    IF PROC_STATUS PROC(proc_pumps_pid) <> 0 THEN STOP "PUMP_PID"
ENDIF
'Turn off all outputs
OP(0, 15, FALSE)
FOR indx = 0 TO 7
    AOUT(indx) = 0
NEXT indx
SET_BIT(nip_roll_status_running_bit, 5000)
'Homing and homed status off
systemstatus = 0
traverse_statusword_vr = 0
traverse_statusword_vr = 0
traverse_controlword_vr = 0
running_pumpa_calibration = 0
running_pumpb_calibration = 0
running_pumpc_calibration = 0
'Run hmi_proerties program so can see EtherCAT startup
RUN "HMI_ANIMATION", proc_hmi_animation
WAIT UNTIL PROC_STATUS PROC(proc_hmi_animation) <> 0

systemstatus.ethercatstarting = 1
'Clear any axisstatus errors on startup
IF AXISSTATUS > 0 THEN DATUM(0)
'Wait for drives to initialize before starting EtherCAT (otherwise no drive EtherCAT comnms)
'Retry loop: on a cold start drives may need longer than the initial WA to be ready.
'Up to 3 attempts are made (5 s wait + 2 s settle each), matching the manual-trigger
'behaviour observed when INIT_PARAMETERS is re-run from Motion Perfect.
IF debug = FALSE THEN
    ethercat_retry = 0
    ethercat_ok = 0
    WHILE ethercat_ok = 0 AND ethercat_retry < 3
        WA(5000)
        ETHERCAT(0,0)
        WA(2000)
        'Clear any axisstatus errors before checking drive state
        FOR indx = axis_traverse TO axis_pump_c
            IF AXISSTATUS AXIS(indx) > 0 THEN
                DATUM(0)
                WAIT LOADED
                WA(100)
                EXIT_LOOP
            ENDIF
        NEXT indx
        ETHERCAT($22, 0, ethercat_status)
        IF VR(ethercat_status) = 3 THEN
            ethercat_ok = 1
        ELSE
            ethercat_retry = ethercat_retry + 1
        ENDIF
    WEND
    IF ethercat_ok = 0 THEN
        systemstatus.ethercatstopped = 1
        GOTO error_handler
    ENDIF
    'If nip roll in fault state, reset
    IF nip_roll_status_word.nip_roll_status_fault_bit = TRUE THEN
        nip_roll_control_word.nip_roll_cntrl_fault_reset_bit = TRUE
        WA(500)
        nip_roll_control_word.nip_roll_cntrl_fault_reset_bit = FALSE
    ENDIF
ENDIF
systemstatus.ethercaterror = 0
systemstatus.ethercatstarting = 0
systemstatus.ethercatstarted = 1
'Reflect actual safety-circuit state at boot.  IN(in_safety_estop) is a
'normally-closed safety input: 0 = E-Stop pressed/active, 1 = released.
'(Same convention used in ERROR_CHECK_AND_RESET.BAS line 51.)  systemstatus
'was zeroed at line 78, so bit 0 only needs to be SET if the input is low.
IF IN(in_safety_estop) = 0 THEN systemstatus.estop_active = 1

'Turn off EStop system error message
FOR indx = axis_traverse TO axis_pump_c
    SERVO AXIS(indx) = 0
NEXT indx

'ETHERCAT($E0, axis_traverse)
'ETHERCAT($E0, axis_pump_a)
'ETHERCAT($E0, axis_pump_b)
'ETHERCAT($E0, axis_pump_c)
'ETHERCAT($E0, axis_niproll)

'Trap any Trio basic errors that might occur in this program
ON BASICERROR GOTO error_handler
'Clear all status and control word bits
traverse_controlword_vr = 0
pumpa_controlword_vr = 0
pumpb_controlword_vr = 0
pumpc_controlword_vr = 0
niproll_controlword_vr = 0

'Incase anything moving, stop
FOR indx = axis_traverse TO axis_pump_c
    CANCEL(2) AXIS(indx)
NEXT indx

WA(500)
systemstatus.enablingdrives = 1
'Traverse servo settings
BASE(axis_traverse)
'invert homing signal as required for homing function
INVERT_IN(in_traversehome, ON)
'define input for homing switch
DATUM_IN = in_traversehome
REV_IN = in_traverse_rslimit
'Using normally closed end of travel
'INVERT_IN(in_traverse_rslimit, ON)
UNITS = (traverse_gearratio * traverse_encodercount) / (traverse_pulleydia * PI)
IF SPEED < .01 THEN
    SPEED = traverse_defaultspeed
ELSE
    SPEED = .5
ENDIF
ACCEL = SPEED
DECEL = SPEED
CREEP = .2
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
'FE_LIMIT = traverse_felimit
'FE_RANGE = traverse_ferange
FE_LIMIT = .5
FE_RANGE = .3
FS_LIMIT = traversefulltravel
RS_LIMIT = traverse_rslimit
'With pulley system there is no Trio homing function, but here for future use
DATUM_IN = in_traversehome
'Reverse encoder (clockwise = negative)
ENCODER_RATIO(-1,1)
STEP_RATIO(-1,1)
'Pump A
BASE(axis_pump_a)
UNITS = (pumpa_encodercount * pumpa_gearratio) / 60
SPEED = .1
ACCEL = SPEED
DECEL = SPEED
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
FE_LIMIT = 10
FE_RANGE = 5
FS_LIMIT = 99999
RS_LIMIT = -99999
REP_OPTION = 1
REP_DIST = 360
'Reverse encoder (clockwise = negative)
'ENCODER_RATIO(-1,1)
'STEP_RATIO(-1,1)
'Pump B
BASE(axis_pump_b)
UNITS = (pumpb_encodercount * pumpb_gearratio) / 60
SPEED = .1
ACCEL = SPEED
DECEL = SPEED
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
FE_LIMIT = 20
FE_RANGE = 5
FS_LIMIT = 99999
RS_LIMIT = -99999
REP_OPTION = 1
REP_DIST = 360
'Reverse encoder (clockwise = negative)
ENCODER_RATIO(-1,1)
STEP_RATIO(-1,1)
'Pump C
BASE(axis_pump_c)
UNITS = pumpc_encodercount * (pumpc_gearratio / 60) 'Changed to kicker rpm
SPEED = 1 '.1 when no kicker
ACCEL = SPEED
DECEL = SPEED
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
FE_LIMIT = 5
FE_RANGE = 3
FS_LIMIT = 99999
RS_LIMIT = -99999
REP_OPTION = 1
REP_DIST = 360
'Reverse encoder (clockwise = negative)
'ENCODER_RATIO(-1,1)
'STEP_RATIO(-1,1)
'Mixer IS NOT A SERVO. CHANGED TO VFD USING DIGITAL AND ANALOG CONTROL
'SO THE FOLLOWING IS ONLY FOR FUTURE IF CHANGE TO OPEN LOOP SERVO
'Running open loop speed so position parameters not material at this time
BASE(axis_mixer)
UNITS = mixer_encodercount * mixer_gearratio
SPEED = 1000
ACCEL = SPEED
DECEL = SPEED
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
FE_LIMIT = 2
FE_RANGE = 1
FS_LIMIT = 99999
RS_LIMIT = -99999
REP_OPTION = 1
REP_DIST = 360

'Nip roll IS NOW FROM ETHERCAT AC VARIABLE FREQUENCY DRIVE (no pulley as on line 1)
'This is therefore not used unless changed to a servo drive.
BASE(axis_niproll)
UNITS = (niproll_encodercount * niproll_gearratio) / (niproll_diameter * PI)
SPEED = .1
ACCEL = SPEED
DECEL = SPEED
'Gains are set in drive
P_GAIN = 1
I_GAIN = 0
D_GAIN = 0
FE_LIMIT = 2
FE_RANGE = 1
FS_LIMIT = 99999
RS_LIMIT = -99999
REP_OPTION = 1
REP_DIST = 360

'Nip roll calculations using VFD to achieve user inches per minute
'nip roll circ
nipcircuf = niproll_diameter * PI
nip_gearout_rpm_60hz = niproll_motor_max_rpm / niproll_gearratio
inches_per_min_60hz = nipcircuf * nip_gearout_rpm_60hz
niproll_inch_per_min_hz = inches_per_min_60hz / 60
'Set mixer analog output for 0 - 10 volts
AOUT_CONFIG(analogout_mixer_head_speed) = 1
AIN_CONFIG(analogin_mixer_speed_ref) = 1

'Turn servoing on, except for mixer which is open loop
FOR indx = axis_traverse TO axis_pump_c
    SERVO AXIS(indx) = 1
NEXT indx

'Enable Trio
WDOG = 1
systemstatus.enablingdrives = 0
systemstatus.driveenabled = 1
triocontrolword_vr.automode = 0
'Start programs
RUN "ERROR_CHECK_AND_RESET", proc_error_check
WAIT UNTIL PROC_STATUS PROC(proc_error_check) <> 0
RUN "RECIPES", proc_recipes
WAIT UNTIL PROC_STATUS PROC(proc_recipes) <> 0
RUN "NIP_ROLL", proc_nip_roll
WAIT UNTIL PROC_STATUS PROC(proc_nip_roll) <> 0
RUN "TRAVERSE", proc_traverse
WAIT UNTIL PROC_STATUS PROC(proc_traverse) <> 0
RUN "CALIBRATION", proc_calibration
WAIT UNTIL PROC_STATUS PROC(proc_calibration) <> 0
RUN "PUMPS_RUN", proc_pumps_run
WAIT UNTIL PROC_STATUS PROC(proc_pumps_run) <> 0
RUN "MIXER", proc_mixer
WAIT UNTIL PROC_STATUS PROC(proc_mixer) <> 0
RUN "HEATER_OFFON_CONTROL", proc_heater_offon
WAIT UNTIL PROC_STATUS PROC(proc_heater_offon) <> 0
RUN "ADISRA_DATA", proc_adisra_data
WAIT UNTIL PROC_STATUS PROC(proc_adisra_data) <> 0
RUN "CONFIG_THERMOCOUPLES", proc_thermocouple_config
WA(200)
RUN "SPEED_MINMAX"
'************** Start Ethernet port section
' Modbus TCP port number
'ETHERNET(1,-1,10,502)
' Modbus TCP
'ETHERNET(1,-1,14,0,1,3) 'map data to VR's
'ETHERNET(1,-1,14,0,2,2) '32 bit floating point
'ETHERNET(1,-1,14,0,6,1) 'Address halving

ETHERNET(1,-1,7,0)

' Enable comm port after the settings were applied
' A Corresponding IP_PROTOCOL_CTRL=4 command should be present in the MC_CONFIG program
'IP_PROTOCOL_CTRL=0
'**************** End of Ethernet port section
IF have_meters THEN
    WA(5000)
    RUN "READ_METERS", proc_read_meters
    WAIT UNTIL PROC_STATUS PROC(proc_read_meters) <> 0
    WA(2000)
    RUN "PUMP_PID", proc_pumps_pid
    WAIT UNTIL PROC_STATUS PROC(proc_pumps_pid) <> 0
    meters_installed = TRUE
ENDIF

'Dashboard data publisher (Modbus TCP read-only block at VR 4000-4023)
RUN "SHARE_DATA", proc_share_data
WAIT UNTIL PROC_STATUS PROC(proc_share_data) <> 0

'Handle any errors in above code
error_handler:
errorno = RUN_ERROR PROC(PROCNUMBER)
errorline = ERROR_LINE PROC(PROCNUMBER)
PRINT #debugport, "Init_Trio error # "; errorno
WA(10)
PRINT #debugport, " at line "; errorline
WA(10)
STOP
