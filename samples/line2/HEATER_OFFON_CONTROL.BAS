'Cartridge heaters do not have thermocouples at this time so set flag
a_cartridge_tc = TRUE
b_cartridge_tc = TRUE

mixhead_timer = 0
mixer_deltapa_timer = 0
mixer_deltapb_timer = 0


'Set TICKS timer
TICKS = mixer_deltapa_update_time
color_green = $FF90EE90
color_red = $FFF08080

'Clear all thermocouple outputs
FOR indx = 0 TO 5
    DV_OUT(indx) = OFF
NEXT indx

GOSUB all_heaters_off

temp_loop:
'°F = (°C x 1.8) + 32
mixer_deltapa_offon_pv = ((DV_IN(analogin_mixhead_deltap_a_rtd) / 100) * 1.8) + 32
mixer_deltapb_offon_pv = ((DV_IN(analogin_mixhead_deltap_b_rtd) / 100) * 1.8) + 32
mixer_head_offon_pv = ((DV_IN(analogin_mixhead_rtd) / 100) * 1.8) + 32
overhead_heater_temp_zone1 = ((DV_IN(analogin_overhead_heat_zone1_tc) / 100) * 1.8) + 32
overhead_heater_temp_zone2 = ((DV_IN(analogin_overhead_heat_zone2_tc) / 100) * 1.8) + 32
overhead_heater_temp_zone3 = ((DV_IN(analogin_overhead_heat_zone3_tc) / 100) * 1.8) + 32

heat_on_time_sec = heat_on_time
heat_off_time_sec = heat_off_time
GOSUB heat_status
'IF IN(in_safety_estop) = 0 THEN
IF TICKS < 1 THEN
    IF mixer_head_open_error = 0 THEN
        GOSUB mixer_heat_control
        GOSUB line_heat_control
    ELSE
        mixer_deltapa_offon_pv = -999
        mixer_deltapb_offon_pv = -999
        mixer_head_offon_pv = -999
    ENDIF
    GOSUB kevlar_heater
    TICKS = 1000
ENDIF
'ELSE
'    GOSUB all_heaters_off
'ENDIF
GOTO temp_loop

line_heat_control:
'Check if SP versus PV above or below deadband and turn on output until within deadband.
IF overhead_zone1_on = 1 AND (overhead_zone1_offon_pv > 40 OR overhead_zone1_override) THEN
    'OVERHEAD_ZONE1_on_color = color_green
    overhead_zone1_error = overhead_zone1_offon_pv - overhead_zone1_offon_sp
    'If cartridge installed
    IF a_cartridge_tc THEN
        'Count down timer
        IF overhead_zone1_timer > 0 THEN overhead_zone1_timer = overhead_zone1_timer - 1
        'Turn off heat if on and at upper deadband or above lower deadband and heat on time has expired
        IF READ_OP(out_preoverhead_zone1_tc) = ON AND (overhead_zone1_error >= overhead_zone1_upper_db OR _
                (overhead_zone1_error >= overhead_zone1_lower_db AND overhead_zone1_timer = 0))THEN
            DV_OUT(overhead_zone1_dv_out) = 0
            OP(out_preoverhead_zone1_tc, OFF)
            overhead_zone1_timer = heat_off_time_sec
        ENDIF
        'Turn on heat if not on and below lower deadband and heat off timer has expired
        IF READ_OP(out_preoverhead_zone1_tc) = OFF AND (overhead_zone1_error < overhead_zone1_lower_db OR _
                (overhead_zone1_error > overhead_zone1_lower_db AND overhead_zone1_error < overhead_zone1_upper_db AND _
                overhead_zone1_timer = 0)) THEN
            DV_OUT(overhead_zone1_dv_out) = 1
            OP(out_preoverhead_zone1_tc, ON)
            overhead_zone1_timer = heat_on_time_sec
        ENDIF
    ELSE
        'under manual button control
        DV_OUT(overhead_zone1_dv_out) = 1
        OP(out_preoverhead_zone1_tc, ON)
    ENDIF
ELSE
    OP(out_preoverhead_zone1_tc, OFF)
    DV_OUT(overhead_zone1_dv_out) = 0
ENDIF
overhead_zone1_stat = DV_OUT(overhead_zone1_dv_out)


'Check if SP versus PV above or below deadband and turn on output until within deadband.
IF overhead_zone2_on = 1 AND (overhead_zone2_offon_pv > 40 OR overhead_zone2_override) THEN
    'OVERHEAD_ZONE2_on_color = color_green
    overhead_zone2_error = overhead_zone2_offon_pv - overhead_zone2_offon_sp

    'Count down timer
    IF overhead_zone2_timer > 0 THEN overhead_zone2_timer = overhead_zone2_timer - 1
    'Turn off heat if on and at upper deadband or above lower deadband and heat on time has expired
    IF READ_OP(out_preoverhead_zone2_hose_tc) = ON AND (overhead_zone2_error >= overhead_zone2_upper_db OR _
            (overhead_zone2_error >= overhead_zone2_lower_db AND overhead_zone2_timer = 0)) THEN
        DV_OUT(overhead_zone2_dv_out) = 0
        OP(out_preoverhead_zone2_hose_tc, OFF)
        overhead_zone2_timer = heat_off_time_sec
    ENDIF
    'Turn on heat if not on and below lower deadband and heat off timer has expired
    IF READ_OP(out_preoverhead_zone2_hose_tc) = OFF AND (overhead_zone2_error < overhead_zone2_lower_db OR _
            (overhead_zone2_error > overhead_zone2_lower_db AND overhead_zone2_error < overhead_zone2_upper_db AND _
            overhead_zone2_timer = 0)) THEN
        DV_OUT(overhead_zone2_dv_out) = 1
        OP(out_preoverhead_zone2_hose_tc, ON)
        overhead_zone2_timer = heat_on_time_sec
    ENDIF
ELSE
    OP(out_preoverhead_zone2_hose_tc, OFF)
    DV_OUT(overhead_zone2_dv_out) = 0
ENDIF
overhead_zone2_stat = DV_OUT(overhead_zone2_dv_out)


'Check if SP versus PV above or below deadband and turn on output until within deadband.
IF overhead_zone3_on = 1 AND (overhead_zone3_offon_pv > 40 OR overhead_zone3_override) THEN
    'OVERHEAD_ZONE3_on_color = color_green
    overhead_zone3_error = overhead_zone3_offon_pv - overhead_zone3_offon_sp
    'Count down timer
    IF overhead_zone3_timer > 0 THEN overhead_zone3_timer = overhead_zone3_timer - 1
    'Turn off heat if on and at upper deadband or above lower deadband and heat on time has expired
    IF READ_OP(out_preoverhead_zone3_hose_tc) = ON AND (overhead_zone3_error >= overhead_zone3_upper_db OR _
            (overhead_zone3_error >= overhead_zone3_lower_db AND overhead_zone3_timer = 0)) THEN
        DV_OUT(overhead_zone3_dv_out) = 0
        OP(out_preoverhead_zone3_hose_tc, OFF)
        overhead_zone3_timer = heat_off_time_sec
    ENDIF
    'Turn on heat if not on and below lower deadband and heat off timer has expired
    IF READ_OP(out_preoverhead_zone3_hose_tc) = OFF AND (overhead_zone3_error < overhead_zone3_lower_db OR _
            (overhead_zone3_error > overhead_zone3_lower_db AND overhead_zone3_error < overhead_zone3_upper_db AND _
            overhead_zone3_timer = 0)) THEN
        DV_OUT(overhead_zone3_dv_out) = 1
        OP(out_preoverhead_zone3_hose_tc, ON)
        overhead_zone3_timer = heat_on_time_sec
    ENDIF
ELSE
    OP(out_preoverhead_zone3_hose_tc, OFF)
    DV_OUT(overhead_zone3_dv_out) = 0
ENDIF
overhead_zone3_stat = DV_OUT(overhead_zone3_dv_out)
RETURN

all_heaters_off:
overhead_zone1_on = 0
overhead_zone2_on = 0
overhead_zone3_on = 0
mixer_head_on = 0
mixer_deltapa_on = 0
mixer_deltapb_on = 0

OP(out_preoverhead_zone1_tc, OFF)
OP(out_preoverhead_zone2_hose_tc, OFF)
OP(out_preoverhead_zone3_hose_tc, OFF)
OP(out_mixer_head_tc, OFF)
OP(out_mixer_deltap_a_tc, OFF)
OP(out_mixer_deltap_b_tc, OFF)
RETURN

heat_status:
IF overhead_zone1_on = 1 THEN
    overhead_zone1_on_color = color_green
ELSE
    overhead_zone1_on_color = color_red
ENDIF
IF overhead_zone2_on = 1 THEN
    overhead_zone2_on_color = color_green
ELSE
    overhead_zone2_on_color = color_red
ENDIF
IF overhead_zone3_on = 1 THEN
    overhead_zone3_on_color = color_green
ELSE
    overhead_zone3_on_color = color_red
ENDIF
IF mixer_head_on = 1 THEN
    mixer_head_on_color = color_green
ELSE
    mixer_head_on_color = color_red
ENDIF
IF mixer_deltapa_on = 1 THEN
    mixer_deltapa_on_color = color_green
ELSE
    mixer_deltapa_on_color = color_red
ENDIF
IF mixer_deltapb_on = 1 THEN
    mixer_deltapb_on_color = color_green
ELSE
    mixer_deltapb_on_color = color_red
ENDIF
RETURN

mixer_heat_control:
IF mixer_head_on = 1 THEN
    mixer_head_error = mixer_head_offon_pv - mixer_head_offon_sp
    IF mixer_head_timer > 0 THEN mixer_head_timer = mixer_head_timer - 1

    IF READ_OP(out_mixer_head_tc) = ON AND (mixer_head_error >= mixer_head_upper_db OR _
            (mixer_head_error >= mixer_head_lower_db AND mixer_head_timer = 0)) THEN
        OP(out_mixer_head_tc, OFF)
        mixer_head_timer = heat_off_time_sec
    ENDIF
    IF READ_OP(out_mixer_head_tc) = OFF AND (mixer_head_error < mixer_head_lower_db OR _
            (mixer_head_error > mixer_head_lower_db AND mixer_head_error < mixer_head_upper_db AND _
            mixer_head_timer = 0)) THEN
        OP(out_mixer_head_tc, ON)
        mixer_head_timer = heat_on_time_sec
    ENDIF
ELSE
    OP(out_mixer_head_tc, OFF)
ENDIF

IF mixer_deltapa_on = 1 THEN
    mixer_deltapa_error = mixer_deltapa_offon_pv - mixer_deltapa_offon_sp
    IF mixer_deltapa_timer > 0 THEN mixer_deltapa_timer = mixer_deltapa_timer - 1

    IF READ_OP(out_mixer_deltap_a_tc) = ON AND (mixer_deltapa_error >= mixer_deltapa_upper_db OR _
            (mixer_deltapa_error >= mixer_deltapa_lower_db AND mixer_deltapa_timer = 0)) THEN
        OP(out_mixer_deltap_a_tc, OFF)
        mixer_deltapa_timer = heat_off_time_sec
    ENDIF
    IF READ_OP(out_mixer_deltap_a_tc) = OFF AND (mixer_deltapa_error < mixer_deltapa_lower_db OR _
            (mixer_deltapa_error > mixer_deltapa_lower_db AND mixer_deltapa_error < mixer_deltapa_upper_db AND _
            mixer_deltapa_timer = 0)) THEN
        OP(out_mixer_deltap_a_tc, ON)
        mixer_deltapa_timer = heat_on_time_sec
    ENDIF
ELSE
    OP(out_mixer_deltap_a_tc, OFF)
ENDIF

IF mixer_deltapb_on = 1 THEN
    mixer_deltapb_error = mixer_deltapb_offon_pv - mixer_deltapb_offon_sp
    IF mixer_deltapb_timer > 0 THEN mixer_deltapb_timer = mixer_deltapb_timer - 1

    IF READ_OP(out_mixer_deltap_b_tc) = ON AND (mixer_deltapb_error >= mixer_deltapb_upper_db OR _
            (mixer_deltapb_error >= mixer_deltapb_lower_db AND mixer_deltapb_timer = 0)) THEN
        OP(out_mixer_deltap_b_tc, OFF)
        mixer_deltapb_timer = heat_off_time_sec
    ENDIF
    IF READ_OP(out_mixer_deltap_b_tc) = OFF AND (mixer_deltapb_error < mixer_deltapb_lower_db OR _
            (mixer_deltapb_error > mixer_deltapb_lower_db AND mixer_deltapb_error < mixer_deltapb_upper_db AND _
            mixer_deltapb_timer = 0)) THEN
        OP(out_mixer_deltap_b_tc, ON)
        mixer_deltapb_timer = heat_on_time_sec
    ENDIF
ELSE
    OP(out_mixer_deltap_b_tc, OFF)
ENDIF
RETURN

kevlar_heater:
IF kevlar_heat_offon = 1 THEN
    percent_per_analog = analog_range / 100
    AOUT(7) = INT(percent_per_analog * kevlar_heat_percent)
ELSE
    AOUT(7) = 0
ENDIF
RETURN

