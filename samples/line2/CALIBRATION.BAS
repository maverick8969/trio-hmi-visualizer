DIM calc_ratio_text AS STRING(22)
DIM target_ratio_text AS STRING(22)
DIM suggested_gpercm3_text AS STRING(40)
pgm_loop:
GOSUB run_calibration
GOSUB show_status
IF btn_calcratio THEN
    btn_calcratio = FALSE
    GOSUB calibrate_ratio

ENDIF
GOTO pgm_loop

run_calibration:
IF triocontrolword_vr.automode = 0 AND hmi_pumps_run = FALSE THEN
    BASE(axis_pump_a)
    IF btn_calibrate_a AND MTYPE = mtype_idle THEN
        running_pumpa_calibration = 1
        VR(cal_pumpa_calc_grams) = 0
        btn_calibrate_a = 0
        DEFPOS(0)
        SPEED = VR(cal_pumpa_rpm_vr)
        ACCEL = SPEED * 2
        DECEL = SPEED * 2
        'Prime
        MOVE(3 * 60)
        WAIT IDLE
        WA(3000)
        MOVE(VR(cal_pumpa_revs_vr) * 60)
        WAIT IDLE
        VR(cal_pumpa_calc_grams) = VR(cal_pumpa_spec) * VR(cal_pumpa_revs_vr)
        running_pumpa_calibration = 0
    ENDIF
    BASE(axis_pump_b)
    IF btn_calibrate_b AND MTYPE = mtype_idle THEN
        running_pumpb_calibration = 1
        VR(cal_pumpb_calc_grams) = 0
        btn_calibrate_b = 0
        DEFPOS(0)
        SPEED = VR(cal_pumpb_rpm_vr)
        ACCEL = SPEED * 2
        DECEL = SPEED * 2
        'Prime
        MOVE(3 * 60)
        WAIT IDLE
        WA(3000)
        MOVE(VR(cal_pumpb_revs_vr) * 60)
        WAIT IDLE
        VR(cal_pumpb_calc_grams) = VR(cal_pumpb_spec) * VR(cal_pumpb_revs_vr)
        running_pumpb_calibration = 0
    ENDIF
    BASE(axis_pump_c)
    IF btn_calibrate_c AND MTYPE = mtype_idle THEN
        running_pumpc_calibration = 1
        VR(cal_pumpb_calc_grams) = 0
        btn_calibrate_c = 0
        DEFPOS(0)
        SPEED = VR(cal_pumpc_rpm_vr)
        ACCEL = SPEED * 2
        DECEL = SPEED * 2
        'Prime
        MOVE(3 * 60)
        WAIT IDLE
        WA(3000)
        MOVE(VR(cal_pumpc_revs_vr) * 60)
        WAIT IDLE
        VR(cal_pumpc_calc_grams) = VR(cal_pumpc_spec) * VR(cal_pumpc_revs_vr)
        running_pumpc_calibration = 1
    ENDIF
ENDIF
'Pump A actual material per rev (average of total revs)
IF VR(cal_pumpa_revs_vr) > 0 THEN VR(pumpa_actual_grams_per_rev_vr) = VR(pumpa_actual) / _
        VR(cal_pumpa_revs_vr)
IF VR(cal_pumpb_revs_vr) > 0 THEN VR(pumpb_actual_grams_per_rev_vr) = VR(pumpb_actual) / VR(cal_pumpb_revs_vr)
IF VR(cal_pumpc_revs_vr) > 0 THEN VR(pumpc_actual_grams_per_rev_vr) = VR(pumpc_actual) / VR(cal_pumpc_revs_vr)
'Get material weight ratio between pump A and B, and A and C.  This is weight ratio
'only and will be converted to volume flow (GMP) ratio base on material grams/cm3.
IF VR(pumpb_actual) > 0 THEN VR(pumpb_to_a_calc_ratio_vr) = VR(pumpa_actual) / VR(pumpb_actual)
IF VR(pumpc_actual) > 0 THEN VR(pumpc_to_a_calc_ratio_vr) = VR(pumpa_actual) / VR(pumpc_actual)
RETURN

show_status:
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
RETURN

calibrate_ratio:
'Check that pre-run test wts have values and pump b target ratio has value
IF pumpawt > 0 AND pumpbwt > 0 AND pumpb_mix_ratio > 0 THEN
    'Show the current pre-run b pump ratio
    pre_run_ratio = pumpbwt / pumpawt
    calc_ratio_text = "Calc ratio:" + STR(pre_run_ratio, 4, 8)
    'Show b pump target ratio setting
    target_ratio_text = "Target ratio:" + STR(pumpb_mix_ratio, 4, 8)
    'Get the actual to target b pump ratio
    prerun_ratio_error = pumpb_mix_ratio / pre_run_ratio
    'Show the suggested correction value to enter in calibration wt for pump A to correct ratio
    suggested_gpercm3 = prerun_ratio_error * VR(pumpa_actual)
    suggested_gpercm3_text = "Suggested pump A actual (grams) " + STR(suggested_gpercm3, 3, 8)
ELSE
    calc_ratio_text = "Invalid data"
ENDIF
RETURN



