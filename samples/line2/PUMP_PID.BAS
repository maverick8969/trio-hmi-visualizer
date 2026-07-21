pumpa_flow_ave = 0
pumpb_mass_flow_ave = 0
pumpa_ave_count = 0
pumpb_ave_count = 0
pumpa_ave_list_full = FALSE
pumpb_ave_list_full = FALSE
pumpa_ave_total = 0
pumpb_ave_total = 0

pumpa_flow_short_ave = 0
pumpb_mass_flow_short_ave = 0
pumpa_short_ave_count = 0
pumpb_short_ave_count = 0
pumpa_short_ave_list_full = FALSE
pumpb_short_ave_list_full = FALSE
pumpa_short_ave_total = 0
pumpb_short_ave_total = 0

pumpa_calibration_started = FALSE
pumpb_calibration_started = FALSE
starting_pump = FALSE
pump_was_off = TRUE
pumpa_min_flow = 1000
pumpa_max_flow = 0
pumpb_min_flow = 1000
pumpb_max_flow = 0
'Clear average list
FOR indx = 0 TO pumpa_flow_ave_list_length -1
    VR(pumpa_flow_ave_start_word + indx) = 0
NEXT indx
FOR indx = 0 TO pumpb_flow_ave_list_length -1
    VR(pumpb_flow_ave_start_word + indx) = 0
NEXT indx
FOR indx = 0 TO pumpa_flow_short_ave_list_len -1
    VR(pumpa_flow_short_ave_start_word + indx) = 0
NEXT indx
FOR indx = 0 TO pumpb_flow_short_ave_list_len -1
    VR(pumpb_flow_short_ave_start_word + indx) = 0
NEXT indx
'Set ticks count down timer for recording flow values in running average list
TICKS = flow_average_sample_rate * 1000
'===================== main loop ==============
speed_loop:
'10/14/24; Set pump a and b average count to user count
pumpa_flow_ave_list_length = pumps_flow_ave_list_length
pumpb_flow_ave_list_length = pumps_flow_ave_list_length
'Recalibrate while running
IF recalibrate_pump_gr_per_rpm = 1 AND (MSPEED AXIS(axis_pump_a)) > .01 AND _
        (MSPEED AXIS(axis_pump_b)) > .01 AND hmi_pumps_run AND running_calibration = FALSE _
        AND pumpa_flow_ave > 0 AND pumpb_flow_ave > 0 THEN
    pumpa_calibrated_gramspersec = pumpa_flow_ave
    pumpa_rpm_per_gramspersec = pumpa_calibrated_gramspersec / (MSPEED AXIS(axis_pump_a) * 60)
    pumpb_calibrated_gramspersec = pumpb_flow_ave
    pumpb_rpm_per_gramspersec = pumpb_calibrated_gramspersec / (MSPEED AXIS(axis_pump_b) * 60)
ENDIF
IF hmi_pumps_run = 1 AND running_calibration = FALSE THEN
    '1-shot for setting initial pump speeds before pump PID control
    IF pump_was_off THEN
        starting_pump = TRUE
        pump_was_off = FALSE
        'IF use_flow_meters AND starting_pump THEN
        'Setup PID loop for pump A based on gal/hr setpoint
'Actual gal/hr  = process variable; User gal/hr setting = setpoint
        GOSUB prepumpa_speed_pid_defaults
'Setup PID loop for pump B based on ratio setpoint
'Actual ratio  = process variable; User Ratio setting = setpoint
        GOSUB prepumpb_speed_pid_defaults
    ENDIF
'Want to show average values also when in manual.  So don't zero whenever pumps are running
ELSEIF MTYPE AXIS(axis_pump_a) = mtype_idle OR MTYPE AXIS(axis_pump_b) = mtype_idle THEN
'ELSEIF IN(hmi_pumps_run) = OFF AND running_calibration = FALSE THEN
    IF MTYPE AXIS(axis_pump_a) = mtype_idle THEN
        pumpa_ave_count = 0
        pumpa_short_ave_count = 0
        pumpa_flow_ave = 0
        pumpa_flow_short_ave = 0
    ENDIF
    IF MTYPE AXIS(axis_pump_b) = mtype_idle THEN
        pump_was_off = TRUE
        starting_pump = FALSE
        pumpb_ave_count = 0
        pumpb_short_ave_count = 0
        pumpb_flow_ave = 0
        pumpb_flow_short_ave = 0
        pumpb_actual_ave_ratio = 0
    ENDIF
    pumpb_actual_short_ave_ratio = 0
ENDIF
pumpa_speed_pid_auto = triocontrolword_vr.automode
pumpb_speed_pid_auto = triocontrolword_vr.automode
IF TICKS < 1 THEN
    IF use_flow_meters AND hmi_pumps_run THEN
        'A pump will be set as originally using RPM.
        'IF pumpa_speed_pid_auto THEN GOSUB pumpa_speed_control
        IF pumpb_speed_pid_auto THEN GOSUB pumpb_speed_control
    ENDIF
    GOSUB pumpa_grpersec_average
    GOSUB pumpb_grpersec_average
    GOSUB pumpa_grpersec_short_average
    GOSUB pumpb_grpersec_short_average
    IF pumpa_flow_ave > 0 THEN pumpb_actual_ave_ratio = pumpb_flow_ave / pumpa_flow_ave
    IF pumpa_flow_short_ave > 0 THEN pumpb_actual_short_ave_ratio = pumpb_flow_short_ave / pumpa_flow_short_ave
    'Reset count down time
    pumpb_speed_pid_scan_time = pid_update_time * 1000
    TICKS = flow_average_sample_rate * 1000
ENDIF
GOSUB calibrate_per_meter
GOTO speed_loop
'===============================================

prepumpa_speed_pid_defaults:
'PID loop update time
pumpa_speed_pid_scan_time = 1
'Minimum output control value
'pumpa_speed_pid_min_out = 0
'Maximum (clipping) output control value
'pumpa_speed_pid_max_out= 200
pumpa_speed_pid_use_i = 1
pumpa_speed_pid_hold_i = 0
'Don't correct until error is more than the dead band setting
'pumpa_speed_pid_deadb_err = .2
'No feed forward
pumpa_speed_pid_ffd = 0

'Set default control values on startup
pumpa_speed_pid_auto = 0
pumpa_speed_pid_igain_reset_val = 0
pumpa_speed_pid_reset_i_sum = TRUE
pumpa_speed_pid_xout_manual = 0
USER_PID ( 1 , pumpa_speed_pid_in_start_word, pumpa_speed_pid_out_start_word)
pumpa_speed_pid__reset_i_sum = FALSE
pumpa_initial_pid_speed = (pumpa_rpm_per_gramspersec * pumpa_calibrated_gramspersec)
RETURN

pumpa_speed_control:
'Correct speed based on flow error from target flow (gal/hr)
IF pumpa_rpm_setpoint > 0 THEN 'AND pumpa_meter_mass_flow_gpersec > 0 THEN

    'Setpoint value is user mix ratio
    pumpa_speed_pid_sp = pumpa_rpm_setpoint
    'Get actual ratio (process variable)
    pumpa_speed_pid_pv = pumpa_flow_ave
    'Use manual control for startup value
    pumpa_speed_pid_xout_manual = pumpa_speed_pid_xout
ENDIF
USER_PID ( 1 , pumpa_speed_pid_in_start_word, pumpa_speed_pid_out_start_word)
SPEED AXIS(axis_pump_a) = pumpa_initial_pid_speed + pumpa_speed_pid_xout
RETURN

prepumpb_speed_pid_defaults:
'IF INTERNAL PID OUT VR'S 7 - 10 SET TO A BOGUS NUMBER (UNKNOWN) WILL NOT ALLOW PID TO RUN
'SO ZERO
FOR indx = pumpb_speed_pid_out_start_word + 7 TO pumpb_speed_pid_out_start_word + 10
    VR(indx) = 0
NEXT indx
'PID loop update time
'Minimum output control value
'pumpb_speed_pid_min_out = -10
'Maximum (clipping) output control value
'pumpb_speed_pid_max_out= 10
pumpb_speed_pid_use_i = 1
pumpb_speed_pid_hold_i = 0
'Don't correct until error is more than the dead band setting
'pumpb_speed_pid_deadb_err = .2
'No feed forward
pumpb_speed_pid_ffd = 0
pumpb_speed_pid_sp = pumpb_mix_ratio
'Set default control values on startup
pumpb_speed_pid_auto = 0
pumpb_speed_pid_igain_reset_val = 0
pumpb_speed_pid_reset_i_sum = TRUE
pumpb_speed_pid_xout_manual = pumpa_speed_pid_auto
USER_PID ( 1 , pumpb_speed_pid_in_start_word, pumpb_speed_pid_out_start_word)
pumpb_speed_pid__reset_i_sum = FALSE
'Set pump b initial speed based on pump A grams at its setpoint speed (pump A grams per second_
'time pump b flow ratio.  Then convert pump b target grams per second to motor rpm
IF pumpa_rpm_setpoint > 0 AND pumpa_rpm_per_gramspersec > 0 AND pumpb_mix_ratio > 0 THEN
    pumpb_initial_pid_speed = (((pumpa_rpm_setpoint * pumpa_rpm_per_gramspersec) * _
        pumpb_mix_ratio) / pumpb_rpm_per_gramspersec)
ENDIF
RETURN

pumpb_speed_control:
'Adjust pump B speed based on ratio setpoint to actual ratio error with PID loop
'setpoint and ratio are set to zero if not to be run and if no meter value (prevent divide by zero error)
IF hmi_pumps_run AND pumpa_rpm_setpoint > 0 AND pumpb_mix_ratio > 0 THEN
    'Setpoint value is user mix ratio
    pumpb_speed_pid_sp = pumpb_mix_ratio + pumpb_ratio_offset
    'Get actual ratio (process variable)
    IF pumpb_mix_ratio > 0 AND pumpa_flow_ave > 0 THEN
        pumpb_speed_pid_pv = pumpb_flow_ave / pumpa_flow_ave
    ENDIF
    'Use manual control for startup value
    pumpb_speed_pid_xout_manual = pumpb_speed_pid_xout
ENDIF
'Initial speed set when starting pump, but here also to catch changing speed on the fly.
'Dived by 60 because trio UNITS is rpm/sec
pumpb_initial_pid_speed = (((pumpa_rpm_setpoint * pumpa_rpm_per_gramspersec) * _
    pumpb_mix_ratio) / pumpb_rpm_per_gramspersec)
USER_PID ( 1 , pumpb_speed_pid_in_start_word, pumpb_speed_pid_out_start_word)
pumpb_pid_speed_adjust =((pumpb_speed_pid_xout * pumpb_rpm_per_gramspersec))
xspeed = pumpb_initial_pid_speed + pumpb_pid_speed_adjust
IF xspeed < SPEED AXIS(axis_pump_a) THEN SPEED AXIS(axis_pump_b) = xspeed
RETURN

pumpa_grpersec_average:
'IF ATYPE AXIS(axis_traverse) <> mtype_idle  AND READ_OP(out_mixerrun) THEN
IF ATYPE AXIS(axis_pump_a) <> mtype_idle THEN
    IF pumpa_meter_mass_flow_gpersec / 100 > pumpa_max_flow THEN pumpa_max_flow = pumpa_meter_mass_flow_gpersec / 100
    IF pumpa_meter_mass_flow_gpersec / 100 < pumpa_min_flow THEN pumpa_min_flow = pumpa_meter_mass_flow_gpersec / 100
ENDIF
VR(pumpa_flow_ave_start_word + pumpa_ave_count) = pumpa_meter_mass_flow_gpersec / 100
pumpa_ave_total = 0
FOR pumpa_ave_indx = 0 TO pumpa_flow_ave_list_length -1
    pumpa_ave_total = pumpa_ave_total + VR(pumpa_flow_ave_start_word + pumpa_ave_indx)
NEXT pumpa_ave_indx
IF pumpa_ave_list_full = FALSE THEN
    pumpa_flow_ave = pumpa_ave_total / (pumpa_ave_count + 1)
ELSE
    pumpa_flow_ave = pumpa_ave_total / pumpa_flow_ave_list_length
ENDIF
pumpa_ave_count = pumpa_ave_count + 1
IF pumpa_ave_count > (pumpa_flow_ave_list_length -1) THEN
    pumpa_ave_list_full = TRUE
    pumpa_ave_count = 0
ENDIF
RETURN

pumpa_grpersec_short_average:
VR(pumpa_flow_short_ave_start_word + pumpa_short_ave_count) = pumpa_meter_mass_flow_gpersec / 100
pumpa_short_ave_total = 0
FOR pumpa_short_ave_indx = 0 TO pumpa_flow_short_ave_list_len -1
    pumpa_short_ave_total = pumpa_short_ave_total + VR(pumpa_flow_short_ave_start_word + pumpa_short_ave_indx)
NEXT pumpa_short_ave_indx
IF pumpa_short_ave_list_full = FALSE THEN
    pumpa_flow_short_ave = pumpa_short_ave_total / (pumpa_short_ave_count + 1)
ELSE
    pumpa_flow_short_ave = pumpa_short_ave_total / pumpa_flow_short_ave_list_len
ENDIF
pumpa_short_ave_count = pumpa_short_ave_count + 1
IF pumpa_short_ave_count > (pumpa_flow_short_ave_list_len -1) THEN
    pumpa_short_ave_list_full = TRUE
    pumpa_short_ave_count = 0
ENDIF
RETURN

pumpb_grpersec_average:
'IF ATYPE AXIS(axis_traverse) <> mtype_idle AND READ_OP(out_mixerrun) THEN
IF ATYPE AXIS(axis_pump_b) <> mtype_idle THEN
    IF pumpb_meter_mass_flow_gpersec / 100 > pumpb_max_flow THEN pumpb_max_flow = pumpb_meter_mass_flow_gpersec / 100
    IF pumpb_meter_mass_flow_gpersec / 100 < pumpb_min_flow THEN pumpb_min_flow = pumpb_meter_mass_flow_gpersec / 100
ENDIF
pumpb_speed_pid_sp = pumpb_mix_ratio
bflow = pumpb_meter_mass_flow_gpersec / 100
IF bflow >= ave_b_min_limit AND bflow <= ave_b_max_limit THEN
    VR(pumpb_flow_ave_start_word + pumpb_ave_count) = pumpb_meter_mass_flow_gpersec / 100
    pumpb_ave_total = 0
    FOR pumpb_ave_indx = 0 TO pumpb_flow_ave_list_length -1
        pumpb_ave_total = pumpb_ave_total + VR(pumpb_flow_ave_start_word + pumpb_ave_indx)
    NEXT pumpb_ave_indx
    IF pumpb_ave_list_full = FALSE THEN
        pumpb_flow_ave = pumpb_ave_total / (pumpb_ave_count + 1)
    ELSE
        pumpb_flow_ave = pumpb_ave_total / pumpb_flow_ave_list_length
    ENDIF
    pumpb_ave_count = pumpb_ave_count + 1
    IF pumpb_ave_count > (pumpb_flow_ave_list_length -1) THEN
        pumpb_ave_list_full = TRUE
        pumpb_ave_count = 0
    ENDIF
ENDIF
RETURN

pumpb_grpersec_short_average:
bflow = pumpb_meter_mass_flow_gpersec / 100
IF bflow >= ave_b_min_limit AND bflow <= ave_b_max_limit THEN
    VR(pumpb_flow_short_ave_start_word + pumpb_short_ave_count) = pumpb_meter_mass_flow_gpersec / 100
    pumpb_short_ave_total = 0
    FOR pumpb_short_ave_indx = 0 TO pumpb_flow_short_ave_list_len -1
        pumpb_short_ave_total = pumpb_short_ave_total + VR(pumpb_flow_short_ave_start_word + pumpb_short_ave_indx)
    NEXT pumpb_short_ave_indx
    IF pumpb_short_ave_list_full = FALSE THEN
        pumpb_flow_short_ave = pumpb_short_ave_total / (pumpb_short_ave_count + 1)
    ELSE
        pumpb_flow_short_ave = pumpb_short_ave_total / pumpb_flow_short_ave_list_len
    ENDIF
    pumpb_short_ave_count = pumpb_short_ave_count + 1
    IF pumpb_short_ave_count > (pumpb_flow_short_ave_list_len -1) THEN
        pumpb_short_ave_list_full = TRUE
        pumpb_short_ave_count = 0
    ENDIF
ENDIF
RETURN

calibrate_per_meter:
'Capture the flow meter gal/hr and grams/sec and calculate the flow per pump RPM to be used for pump speed control
'during calibration based on the flow meter target (Pump A gal/hr target and Pump B grams/sec ratio to pump A grams/
'sec target).  Record once MSPEED (actual) reaches SPEED (setpoint) and use actual MSPEED for calc
IF running_pumpa_calibration = 1 AND MSPEED AXIS(axis_pump_a) > .01 THEN
    'Zero values at start to get max value
    IF pumpa_calibration_started = FALSE THEN
        pumpa_calibrated_galperhr = 0
        pumpa_calibrated_gramspersec = 0
        pumpa_calibration_started = TRUE
    ENDIF
    IF pumpa_meter_mass_flow_galperhr / 100 > pumpa_calibrated_galperhr THEN
        pumpa_calibrated_galperhr = pumpa_meter_mass_flow_galperhr / 100
        pumpa_rpm_per_galperhr = pumpa_calibrated_galperhr / (MSPEED AXIS(axis_pump_a) * 60)
    ENDIF
    IF pumpa_meter_mass_flow_gpersec / 100 > pumpa_calibrated_gramspersec THEN
        pumpa_calibrated_gramspersec = pumpa_meter_mass_flow_gpersec / 100
        pumpa_rpm_per_gramspersec = pumpa_calibrated_gramspersec / (MSPEED AXIS(axis_pump_a) * 60)
    ENDIF
ENDIF
IF running_pumpa_calibration = 0 THEN pumpa_calibration_started = FALSE
IF running_pumpb_calibration = 1 AND MSPEED AXIS(axis_pump_b) >.01 THEN
    'Zero values at start to get max value
    IF pumpb_calibration_started = FALSE THEN
        pumpb_calibrated_galperhr = 0
        pumpb_calibrated_gramspersec = 0
        pumpb_calibration_started = TRUE
    ENDIF
    IF pumpb_meter_mass_flow_galperhr / 100 > pumpb_calibrated_galperhr THEN
        pumpb_calibrated_galperhr = pumpb_meter_mass_flow_galperhr / 100
        pumpb_rpm_per_galperhr = pumpb_calibrated_galperhr / (MSPEED AXIS(axis_pump_b) * 60)
    ENDIF
    IF pumpb_meter_mass_flow_gpersec / 100 > pumpb_calibrated_gramspersec THEN
        pumpb_calibrated_gramspersec = pumpb_meter_mass_flow_gpersec / 100
        pumpb_rpm_per_gramspersec = pumpb_calibrated_gramspersec / (MSPEED AXIS(axis_pump_b) * 60)
    ENDIF
ENDIF
IF running_pumpb_calibration = 0 THEN pumpb_calibration_started = FALSE
RETURN

