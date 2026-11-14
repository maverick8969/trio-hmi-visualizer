pumpa_speed_pid_scan_time = 1
TICKS = 1000
pgm_loop:
'Recalibrate while running
IF recalibrate_pump_gr_per_rpm = 1 AND (MSPEED AXIS(axis_pump_a)) > .01 AND _
        (MSPEED AXIS(axis_pump_b)) > .01 AND IN(in_pumpsrun_os1) AND running_calibration = FALSE _
        AND pumpa_flow_ave > 0 AND pumpb_flow_ave > 0 THEN
    pumpa_calibrated_gramspersec = pumpa_flow_ave
    pumpa_rpm_per_gramspersec = pumpa_calibrated_gramspersec / (MSPEED AXIS(axis_pump_a) * 60)
    pumpb_calibrated_gramspersec = pumpb_flow_ave
    pumpb_rpm_per_gramspersec = pumpb_calibrated_gramspersec / (MSPEED AXIS(axis_pump_b) * 60)
ENDIF
IF TICKS < 1 THEN
'Adjust pump B speed based on ratio setpoint to actual ratio error with PID loop
'setpoint and ratio are set to zero if not to be run and if no meter value (prevent divide by zero error)
    IF IN(in_pumpsrun_os1) AND pumpa_rpm_setpoint > 0 AND pumpb_mix_ratio > 0 THEN
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
        pumpb_mix_ratio) / pumpb_rpm_per_gramspersec) / 60
    USER_PID ( 1 , pumpb_speed_pid_in_start_word, pumpb_speed_pid_out_start_word)
    pumpb_pid_speed_adjust =((pumpb_speed_pid_xout * pumpb_rpm_per_gramspersec)/60)
    xspeed = pumpb_initial_pid_speed + pumpb_pid_speed_adjust
    TICKS = 1000
ENDIF
GOTO pgm_loop
