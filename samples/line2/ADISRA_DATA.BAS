adisra_record_flow = 0
adisra_record_speed = 0
adisra_record_temp = 0
pgm_loop:
'Modbus floating point number does not work here, so convert
'decimal portion of number to integer to be divided by 10000 in ADISRA app
'***************  B pump ratio value and trend ************************************
'Mix ratio setpoint whole portion (should be less than 1, but here anyway)
adisra_mix_ratio_sp_int = INT(pumpb_mix_ratio)
'Mix ratio setpoint fraction to int to be divided by 10000 in ADISRA
adisra_mix_ration_sp_dec = (pumpb_mix_ratio - adisra_mix_ratio_sp_int) * 10000
'Mix ratio actual whole portion (should be less than 1, but here anyway)
adisra_mix_ratio_actual_int = INT(pumpb_actual_short_ave_ratio)
'Mix ratio actual franction to int
adisra_mix_ration_actual_dec = (pumpb_actual_short_ave_ratio - adisra_mix_ratio_actual_int) * 10000
'**********************************************************************************
'Meters flow and density are integers with implied two decimal places, so ADISRA
'Modbus reading them and divides by 100 in script.

'While data is used for trending, it is also used for recording data history
'which is on a different time base than trending and only recorded when pumps
'and traverse running. One tag for each ADISRA service enable
'Removed traverse condition 4/23/25
IF MTYPE AXIS(axis_pump_a) <> mtype_idle THEN
'IF MTYPE AXIS(axis_traverse) <> mtype_idle AND MTYPE AXIS(axis_pump_a) <> mtype_idle THEN
    adisra_record_flow = 1
    adisra_record_speed = 1
    adisra_record_temp = 1
ELSE
    adisra_record_flow = 0
    adisra_record_speed = 0
    adisra_record_temp = 0
ENDIF
adisra_pumpa_mspeed = INT(MSPEED AXIS(axis_pump_a))
adisra_pumpb_mspeed = INT(MSPEED AXIS(axis_pump_b))
adisra_pumpc_mspeed = INT(MSPEED AXIS(axis_pump_c))
adisra_pumpa_mspeed_decimal = (MSPEED AXIS(axis_pump_a) - adisra_pumpa_mspeed) * 100
adisra_pumpb_mspeed_decimal = (MSPEED AXIS(axis_pump_b) - adisra_pumpb_mspeed) * 100
adisra_pumpc_mspeed_decimal = (MSPEED AXIS(axis_pump_c) - adisra_pumpc_mspeed) * 100
'Yield to the BASIC scheduler.  Without this, pgm_loop hot-spins as
'fast as the interpreter dispatches, denying SHARE_DATA and other
'default-priority programs cycles in the round-robin queue.  ADISRA
'SCADA polls these mirror VRs at ~1 Hz, so a 50 ms refresh is plenty
'fast and removes ADISRA_DATA as a starvation source for the
'SHARE_DATA WA(2000) wakeup window.
WA(50)
GOTO pgm_loop:
