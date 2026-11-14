DIM recipeno AS STRING (20)
DIM pumpaspeed AS STRING (20)
DIM pumpbspeed AS STRING (20)
DIM pumpcspeed AS STRING (20)
DIM traversespeed AS STRING (17)
DIM niprollspeed AS STRING (20)
DIM pumpasetspeed AS STRING (20)
DIM pumpbsetratio AS STRING (20)
DIM pumpcsetratio AS STRING (20)
DIM traverseposition AS STRING (24)
DIM traverseactualspeed AS STRING(30)
DIM pumpacalcgrams AS STRING(18)
DIM pumpbcalcgrams AS STRING(18)
DIM pumpccalcgrams AS STRING(18)

DIM hmi_autobtn_text AS STRING(12)
DIM hmi_operator_text AS STRING(20)
DIM hmi_traverse_home_text AS STRING(18)
DIM hmi_enabled_text AS STRING(18)
DIM hmi_material_width_text AS STRING(20)

DIM pumpa_actual_gph_text AS STRING(15)
DIM pumpb_actual_gph_text AS STRING(15)
DIM pumpc_actual_gph_text AS STRING(15)

DIM pumpa_actual_gramspersec_text AS STRING(15)
DIM pumpb_actual_gramspersec_text AS STRING(15)
DIM pumpc_actual_gramspersec_text AS STRING(15)

DIM pumpb_actual_ratio_text AS STRING(15)

DIM traversestatuserrortext AS STRING(22)
DIM pumpastatuserrortext AS STRING(22)
DIM pumpbstatuserrortext AS STRING(22)
DIM pumpcstatuserrortext AS STRING(22)

DIM pumpamanualbtntext AS STRING(3)
DIM pumpbmanualbtntext AS STRING(3)
DIM pumpcmanualbtntext AS STRING(3)
DIM mixermanualbtntext AS STRING(3)

DIM product_length_text AS STRING(15)
DIM heat_off_on_text AS STRING(10)
DIM zone_status_text AS STRING(20)
DIM zone_pump_text AS STRING(20)

'Single dimension with require length in second parameter
'(first dimension count, second dimension count, string length)
'Or as here (first dimension count, string length)
DIM statuserrortext AS STRING(12, 22)

statuserrortext(axisstatusspeedlimit) = "Speed Limit"
statuserrortext(axisstatusfollowingwarn) = "Following Warning"
statuserrortext(axisstatuscommerror) = "Communication Error"
statuserrortext(axisstatusremotedrive) = "Remote Drive Error"
statuserrortext(axisstatusforwardeot) = "Forward End Of Travel"
statuserrortext(axisstatusreverseeot) = "Reverse End Of Travel"
statuserrortext(axisstatushoming) = "Homing"
statuserrortext(axisstatusfreehold) = "Free Hold Active"
statuserrortext(axisstatusfollowingerror) = "Following Error"
statuserrortext(axisstatusfslimit) = "Forward Soft Limit"
statuserrortext(axisstatusrslimit) = "Reverse Soft Limit"
statuserrortext(axisstatusmovecancel) = "Move Canceled"

color_green = $FF90EE90
color_red = $FFF08080
color_yellow = $FFFFFF00
color_white = $FFFFFFFF
color_dark_green = $FF228B22
color_dark_red = $FFC00000

hmi_pumps_run = 0

TICKS = secs_before_alarm
pgm_loop:

GOSUB set_colors
GOSUB set_data
GOSUB setoperatormsg
GOSUB set_traverse_position
GOSUB set_material
GOSUB set_axisstatus
GOTO pgm_loop

set_colors:
IF IN(in_traversehome) = FALSE THEN
    homeswcolor = color_green
ELSE
    homeswcolor = color_red
ENDIF

IF IN(in_traverse_rslimit) = FALSE THEN
    reverseeotcolor = color_green
ELSE
    reverseeotcolor = color_red
ENDIF
IF READ_OP(out_mixerrun) THEN
    mixercolor = color_green
ELSE
    mixercolor = color_red
ENDIF
RETURN

set_data:
recipeno = "Selected Recipe " + STR(VR(100), 0, 2)
inpersec = SPEED AXIS(axis_traverse)
traversespeed = "Head Speed " + STR(inpersec, 2, 4)
rpm = MSPEED AXIS(axis_pump_a)
pumpaspeed = "Actual RPM " + STR(rpm, 3, 6)
rpm = MSPEED AXIS(axis_pump_b)
pumpbspeed = "RPM " + STR(rpm, 3, 6)
rpm = MSPEED AXIS(axis_pump_c)
pumpcspeed = "RPM " + STR(rpm, 3, 6)
inchespermin = SPEED AXIS(axis_niproll)
niprollspeed = "Nip Roll Speed " + STR(inchespermin, 2, 5)
spd = SPEED AXIS(axis_pump_a)
pumpasetspeed = "Set RPM " + STR(spd, 2, 5)
pumpbsetratio = "Ratio " + STR(pumpb_mix_ratio, 4, 6) + "%"
pumpcsetratio = "Ratio " + STR(pumpc_mix_ratio, 4, 6) + "%"

travpos = MPOS AXIS(axis_traverse)
traverseposition = "Traverse Position " + STR(travpos, 2, 6)
travspeed = MSPEED AXIS(axis_traverse)
traverseactualspeed = "Traverse Speed (in/sec) " + STR(travspeed, 2, 6)

pumpacalcgrams = "Calculated " + STR(VR(cal_pumpa_calc_grams), 2, 0)
pumpbcalcgrams = "Calculated " + STR(VR(cal_pumpb_calc_grams), 2, 0)
pumpccalcgrams = "Calculated " + STR(VR(cal_pumpc_calc_grams), 2, 0)

'6/18/2024 changed to use meters
'pumpa_actual_gph_text = "Flow GPH:" + STR(pumpa_actual_gph_vr, 2, 5)
'pumpb_actual_gph_text = "Flow GPH:" + STR(pumpb_actual_gph_vr, 2, 5)
'pumpc_actual_gph_text = "Flow GPH:" + STR(pumpc_actual_gph_vr, 2, 5)
IF VR(pumpa_meter_modbus_handle) > -1 THEN
    pumpa_actual_gph_text = "Gal/Hr:" + STR(pumpa_meter_mass_flow_galperhr/100, 2, 5)
    pumpa_actual_gramspersec_text = "gr/sec:" + STR(pumpa_meter_mass_flow_gpersec/100, 2, 5)
ELSE
    pumpa_actual_gph_text = "A METER ERROR"
    pumpa_actual_gramspersec_text = "A METER ERROR"
ENDIF
pumpb_actual_gph_text = "gr/sec:" + STR(pumpb_flow_ave, 2, 5)
pumpc_actual_gph_text = "Gal/Hr:" + STR(pumpc_actual_gph_vr, 2, 5)

IF VR(pumpb_meter_modbus_handle) > -1 THEN
    pumpb_actual_gramspersec_text = "gr/sec:" + STR(pumpb_meter_mass_flow_gpersec/100, 2, 5)
ELSE
    pumpb_actual_gramspersec_text = "B METER ERROR"
ENDIF

IF pumpa_meter_mass_flow_gpersec/100 > 0 THEN bratio = (pumpb_meter_mass_flow_gpersec/100) / _
        (pumpa_meter_mass_flow_gpersec/100)

pumpb_actual_ratio_text = STR(bratio, 5, 7)

IF material_start_pos > 0 AND material_end_pos > material_start_pos THEN material_width = material_end_pos - _
        material_start_pos
hmi_material_width_text = "Width " + STR(material_width, 2, 5)

product_length_text = "Length " + STR(product_length, 2, 7)

'Zone control status display
IF zone_control_enable = 1 THEN
    IF zone_current = 1 THEN
        zone_status_text = "Zone: End (Depart)"
        zone_status_color = color_yellow
    ELSEIF zone_current = 2 THEN
        zone_status_text = "Zone: Center"
        zone_status_color = color_green
    ELSEIF zone_current = 3 THEN
        zone_status_text = "Zone: End (Arrive)"
        zone_status_color = color_yellow
    ELSE
        zone_status_text = "Zone: --"
        zone_status_color = color_white
    ENDIF
ELSE
    zone_status_text = "Zones: OFF"
    zone_status_color = color_white
ENDIF
'Zone pump multiplier display (per-zone independent)
IF zone_pump_control_enable = 1 THEN
    IF zone_current = 1 THEN
        zone_pump_text = "Pump Z1:" + STR(zone1_pump_pct, 0, 3) + "%"
    ELSEIF zone_current = 2 THEN
        zone_pump_text = "Pump Z2:" + STR(zone2_pump_pct, 0, 3) + "%"
    ELSEIF zone_current = 3 THEN
        zone_pump_text = "Pump Z3:" + STR(zone3_pump_pct, 0, 3) + "%"
    ELSE
        zone_pump_text = "Pump: --"
    ENDIF
ELSE
    zone_pump_text = "Pump Zone: OFF"
ENDIF
'Zone enable checkbox colors (working VRs — for operator screen)
IF zone_control_enable = 1 THEN
    zone_enable_color = color_green
ELSE
    zone_enable_color = color_red
ENDIF
IF zone_pump_control_enable = 1 THEN
    zone_pump_enable_color = color_green
ELSE
    zone_pump_enable_color = color_red
ENDIF
'Zone enable checkbox colors (buffer VRs — for recipe edit screen)
'Dark = saved (buffer matches working), Light = unsaved (pending change)
'Green = enabled, Red = disabled
IF buffer_zone_control_enable <> 0 THEN
    IF zone_control_enable = 1 THEN
        buffer_zone_enable_color = color_dark_green
    ELSE
        buffer_zone_enable_color = color_green
    ENDIF
ELSE
    IF zone_control_enable = 0 THEN
        buffer_zone_enable_color = color_dark_red
    ELSE
        buffer_zone_enable_color = color_red
    ENDIF
ENDIF
IF buffer_zone_pump_control_enable <> 0 THEN
    IF zone_pump_control_enable = 1 THEN
        buffer_zone_pump_enable_color = color_dark_green
    ELSE
        buffer_zone_pump_enable_color = color_green
    ENDIF
ELSE
    IF zone_pump_control_enable = 0 THEN
        buffer_zone_pump_enable_color = color_dark_red
    ELSE
        buffer_zone_pump_enable_color = color_red
    ENDIF
ENDIF
RETURN

setoperatormsg:
IF triocontrolword_vr.automode = 1 THEN
    hmi_autobtn_text = "Auto Mode"
    hmi_autobtn_color = color_green
    hmi_manual_visible = 0
ELSE
    hmi_autobtn_text = "Manual Mode"
    hmi_autobtn_color = color_yellow
    hmi_manual_visible = 1
ENDIF
IF traverse_statusword_vr.statusbithoming = 1 THEN
    hmi_traverse_home_text = "Traverse Homing"
    hmi_traverse_home_color = color_yellow
ELSEIF traverse_statusword_vr.statusbithomed = 1 THEN
    hmi_traverse_home_text = "Traverse Homed"
    hmi_traverse_home_color = color_green
ELSE
    hmi_traverse_home_text = "Traverse NOT Homed"
    hmi_traverse_home_color = color_red
ENDIF
IF systemstatus.driveenabled = 0 THEN
    IF systemstatus.ethercatstopped THEN
        hmi_operator_text = "EtherCAT stopped"
        hmi_operator_color = color_red
    ELSEIF systemstatus.ethercatstarting = 1 THEN
        hmi_operator_text = "EtherCAT Starting"
        hmi_operator_color = color_yellow
    ELSEIF systemstatus.ethercatstarted = 1 THEN
        hmi_operator_text = "EtherCAT Started"
        hmi_operator_color = color_yellow
    ELSEIF systemstatus.enablingdrives = 1 THEN
        hmi_operator_text = "Enabling Drives"
        hmi_operator_color = color_green
    ENDIF
ENDIF
'IF systemstatus.estop_active = 0 THEN
IF systemstatus.ethercatstarted = 1 THEN
    'for debug until autostep is global and set in auto sequence
    autostep = 0
    IF autostep = 0 AND systemstatus.driveenabled = 1 THEN
        hmi_operator_text = "Ready"
        hmi_operator_color = color_green
    ELSEIF autostep > 0 THEN
        hmi_operator_text = "Running"
        hmi_operator_color = color_yellow
    ELSE
        'hmi_operator_text = "Not Homed"
        'hmi_operator_color = color_red
    ENDIF

    ENDIF
'ELSE
'    hmi_operator_text = "EMERGENCY STOP"
'    hmi_operator_color = color_red
'ENDIF
IF WDOG THEN
    hmi_enabled_text = "Drives Enabled"
    hmi_enable_color = color_green
    systemstatus.driveenabled = 1
ELSE
    hmi_enabled_text = "Drives DISABLED"
    hmi_enable_color = color_red
    systemstatus.driveenabled = 0
ENDIF
RETURN

set_traverse_position:
fulltravel = homefromtable + traversefulltravel
'pixelsperinch = ((traversehomepospixel - tableleftpixels) / fulltravel)
pixelsperinch = (traversehomepospixel + (traversepixelwidth / 2)) / fulltravel
traversepixelpos = traversehomepospixel - (MPOS AXIS(axis_traverse) * pixelsperinch)
mixerpixelpos = mixerhomepospixel - (MPOS AXIS(axis_traverse) * pixelsperinch)
mixerlabelpos = mixerlabelpospixel - (MPOS AXIS(axis_traverse) * pixelsperinch)
RETURN

set_material:
'table graphic object pixel position right side (from left of screen)
tablerightpixels = tableleftpixels + tablewidthpixels
'material grapic object pixel position on left (start pixel position of object)
material_left_pixelpos = (traversehomepospixel + traversepixelwidth /2) - _
    ((material_end_pos) * pixelsperinch)
'material_left_pixelpos = traversehomepospixel - ((material_start_pos + material_width) * pixelsperinch) + _
'    (traversepixelwidth /2)
material_width_pixels = material_width * pixelsperinch
'Zone boundary pixel positions for HMI display
IF zone_control_enable = 1 THEN
    zone_l_pixelpos = (traversehomepospixel + traversepixelwidth / 2) - _
        (zone_boundary_l * pixelsperinch)
    zone_r_pixelpos = (traversehomepospixel + traversepixelwidth / 2) - _
        (zone_boundary_r * pixelsperinch)
ENDIF
RETURN

set_axisstatus:
BASE(axis_traverse)
IF AXISSTATUS = 0 AND WDOG AND SERVO = 1 THEN
    traversefaultvisible = FALSE
    traversefaultcolor = color_green
    IF MTYPE = mtypeidle THEN
        traverseservocolor = color_green
    ELSE
        traverseservocolor = color_yellow
    ENDIF
    traversestatuserrortext = "No fault"

ELSE
    traversefaultvisible = TRUE
    traverseservocolor = color_red
    traversefaultcolor = color_red
    IF AXISSTATUS < (2 ^ 12) AND AXISSTATUS > 0 THEN
        FOR bitno = 0 TO 11
            IF AXISSTATUS.bitno THEN
                traversestatuserrortext = statuserrortext(bitno)
            ENDIF
        NEXT bitno
    ELSE
        IF WDOG = FALSE THEN traversestatuserrortext = "Trio Disabled"
        IF SERVO = 0 THEN traversestatuserrortext = "SERVO off"
    ENDIF
ENDIF

BASE(axis_pump_a)
IF AXISSTATUS = 0 AND WDOG AND SERVO = 1 THEN
    pumpafaultvisible = FALSE
    pumpafaultcolor = color_green
    IF MTYPE = mtypeidle THEN
        pumpamanualbuttoncolor = color_red
        pumpamanualbtntext = "OFF"
        pumpaservocolor = color_green
    ELSE
        pumpamanualbuttoncolor = color_green
        pumpamanualbtntext = "ON"
        pumpaservocolor = color_yellow
    ENDIF
    pumpastatuserrortext = "No fault"
ELSE
    pumpafaultvisible = TRUE
    pumpaservocolor = color_red
    pumpafaultcolor = color_red
    pumpamanualbtntext = "OFF"
    pumpamanualbuttoncolor = color_red
    IF AXISSTATUS < (2 ^ 12) AND AXISSTATUS > 0 THEN
        FOR bitno = 0 TO 11
            IF AXISSTATUS.bitno THEN
                pumpastatuserrortext = statuserrortext(bitno)
            ENDIF
        NEXT bitno
    ELSE
        IF WDOG = FALSE THEN pumpastatuserrortext = "Trio Disabled"
        IF SERVO = 0 THEN pumpastatuserrortext = "SERVO off"
    ENDIF
ENDIF

BASE(axis_pump_b)
IF AXISSTATUS = 0 AND WDOG AND SERVO = 1 THEN
    pumpbfaultvisible = FALSE
    pumpbfaultcolor = color_green
    IF MTYPE = mtypeidle THEN
        pumpbmanualbuttoncolor = color_red
        pumpbmanualbtntext = "OFF"
        pumpbservocolor = color_green
    ELSE
        pumpbmanualbuttoncolor = color_green
        pumpbmanualbtntext = "ON"
        pumpbservocolor = color_yellow
    ENDIF
    pumpbstatuserrortext = "No fault"
ELSE
    pumpbfaultvisible = TRUE
    pumpbservocolor = color_red
    pumpbfaultcolor = color_red
    pumpbmanualbuttoncolor = color_red
    pumpbmanualbtntext = "OFF"
    IF AXISSTATUS < (2 ^ 12) AND AXISSTATUS > 0 THEN
        FOR bitno = 0 TO 11
            IF AXISSTATUS.bitno THEN
                pumpbstatuserrortext = statuserrortext(bitno)
            ENDIF
        NEXT bitno
    ELSE
        IF WDOG = FALSE THEN pumpbstatuserrortext = "Trio Disabled"
        IF SERVO = 0 THEN pumpbstatuserrortext = "SERVO off"
    ENDIF
ENDIF

BASE(axis_pump_c)
IF AXISSTATUS = 0 AND WDOG AND SERVO = 1 THEN
    pumpcfaultvisible = FALSE
    pumpcfaultcolor = color_green
    IF MTYPE = mtypeidle THEN
        pumpcmanualbuttoncolor = color_red
        pumpcmanualbtntext = "OFF"
        pumpcservocolor = color_green
    ELSE
        pumpcmanualbuttoncolor = color_green
        pumpcmanualbtntext = "ON"
        pumpcservocolor = color_yellow
    ENDIF
    pumpcstatuserrortext = "No fault"
ELSE
    pumpcfaultvisible = TRUE
    pumpcservocolor = color_red
    pumpcfaultcolor = color_red
    pumpcmanualbuttoncolor = color_red
    pumpcmanualbtntext = "OFF"
    IF AXISSTATUS < (2 ^ 12) AND AXISSTATUS > 0 THEN
        FOR bitno = 0 TO 11
            IF AXISSTATUS.bitno THEN
                pumpcstatuserrortext = statuserrortext(bitno)
            ENDIF
        NEXT bitno
    ELSE
        IF WDOG = FALSE THEN pumpcstatuserrortext = "Trio Disabled"
        IF SERVO = 0 THEN pumpcstatuserrortext = "SERVO off"
    ENDIF
ENDIF

IF READ_OP(out_mixerrun) THEN
    mixermanualbtntext = "ON"
ELSE
    mixermanualbtntext = "OFF"
ENDIF

IF hmi_pumps_run = 1 THEN
    pumpsruncolor = color_green
ELSE
    pumpsruncolor = color_red
ENDIF

IF READ_OP(out_pumpspurgesol1) THEN
    purgecolor = color_green
ELSE
    purgecolor = color_red
ENDIF

IF traverse_controlword_vr.controlbitinitmove THEN
    traversecyclecolor = color_green
ELSE
    traversecyclecolor = color_red
ENDIF

'Turn on out of tolerance stack light
IF pumpb_speed_pid_er > ratio_alarm_limit AND TICKS < 1 THEN
    OP(out_stacklight_red, ON)
ELSE
    OP(out_stacklight_red, OFF)
ENDIF
IF pumpb_speed_pid_er < (ratio_alarm_limit * -1) AND TICKS < 1 THEN
    OP(out_stacklight_yellow, ON)
ELSE
    OP(out_stacklight_yellow, OFF)
ENDIF
IF ABS(pumpb_speed_pid_er) < ratio_alarm_limit THEN
    TICKS = secs_before_alarm
ENDIF

'Kevlar heat button color
IF kevlar_heat_offon = 1 THEN
    kevlar_heat_button_color = color_green
ELSE
    kevlar_heat_button_color = color_red
ENDIF
RETURN
