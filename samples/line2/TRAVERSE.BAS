cycleselected = FALSE
disable_datagrid = 0
slip_comp = TRUE
DEFPOS(0)
pgm_loop:
BASE(axis_traverse)
'Check that not in automode
IF triocontrolword_vr.automode = 0 THEN
    disable_datagrid = 1
    zone_current = 0
    'manual moves
    GOSUB manual_moves
    IF MTYPE AXIS(axis_traverse) = mtype_idle AND traverse_statusword_vr.statusbithoming = 0 AND _
            traverse_controlword_vr.controlbitinitmove = 0 AND traverse_controlword_vr.controlbithome = 1 THEN
        GOSUB home_traverse
    ENDIF
ELSE
    disable_datagrid = 0
    'Auto mode
    IF traverse_controlword_vr.controlbitinitmove = 1 AND traverse_statusword_vr.statusbithomed = 1 THEN
        SPEED = traverse_speed_setpt
        ACCEL = traverse_accel
        DECEL = traverse_decel
        'Check for speed change
        GOSUB speed_change
        'automatic traversing back and forth moves
        GOSUB auto_moves
    ENDIF
ENDIF
'Bring to zero button used if home has been set (one shot)
IF MTYPE AXIS(axis_traverse) = mtype_idle AND traverse_statusword_vr.statusbithomed = 1 AND _
        traverse_controlword_vr.controlbitinitmove = 0 AND traverse_statusword_vr.statusbithoming = 0 AND _
        cycleselected = TRUE THEN
    CANCEL(2)
    MOVEABS(0)
    WAIT IDLE
    cycleselected = FALSE
ENDIF
IF traverse_controlword_vr.controlbitinitmove = 1 AND cycleselected = FALSE THEN cycleselected = TRUE
GOTO pgm_loop

home_traverse:
DEFPOS(0)
traverse_statusword_vr.statusbithomed = 0
traverse_statusword_vr.statusbithoming = 1
traverse_controlword_vr.controlbithome = 0
'Set limits so will not get end of travel
RS_LIMIT = -999
'Save existing speed, accel and decel to resume after homing
current_speed = SPEED
current_accel = ACCEL
current_decel = DECEL
'Actuator has small homw switch window so must stop quickly since the homing function requires that
'it stop on the homing switch and then reverse creep speed off the switch.  If overtravels the switch
'during homing will think off the switch and not reverse direction (be on wrong side of home switch)
SPEED = 2
ACCEL = 40
DECEL = 40
CREEP = .5
'If on reverse limit switch move until see home switch
IF in_traverse_rslimit THEN
    FORWARD
    WAIT UNTIL IN(in_traversehome)
    CANCEL(2)
ENDIF
'Run homing function
DATUM(4)
WAIT IDLE
traverse_statusword_vr.statusbithoming = 0
traverse_statusword_vr.statusbithomed = 1
SPEED = current_speed
ACCEL = current_accel
DECEL = current_decel
RS_LIMIT = traverse_rslimit
RETURN

speed_change:
button_increment = .5
'check if increment or decrement button pressed
IF traverse_increment THEN
    traverse_increment = FALSE
    traverse_speed_setpt = traverse_speed_setpt + button_increment
    IF traverse_speed_setpt > 70 THEN traverse_speed_setpt = 70
    'Save to recipe buffer in case decide to save in recipe
    buffertraverse_speed_setpt = traverse_speed_setpt
    WA(1000) 'incase holding button
ENDIF
IF traverse_decrement THEN
    traverse_decrement = FALSE
    traverse_speed_setpt = traverse_speed_setpt - button_increment
    IF traverse_speed_setpt < 0 THEN traverse_speed_setpt = 0
    WA(1000) 'incase holding button
    buffertraverse_speed_setpt = traverse_speed_setpt
ENDIF
RETURN

manual_moves:
IF triocontrolword_vr.automode = 0 THEN
'Jog traverse
    IF MTYPE AXIS(axis_traverse) = mtype_idle THEN
        IF traverse_controlword_vr.controlbitjogfwd = 1 THEN
            SPEED = 4
            ACCEL = 8
            DECEL = 8
            FORWARD AXIS(axis_traverse)
        ENDIF
        IF traverse_controlword_vr.controlbitjogrev = 1 THEN
            SPEED = 4
            ACCEL = 8
            DECEL = 8
            REVERSE AXIS(axis_traverse)
        ENDIF
    ELSE
        IF traverse_statusword_vr.homing = 0 AND traverse_controlword_vr.controlbitjogfwd = 0 AND _
                traverse_controlword_vr.controlbitjogrev = 0 THEN
            CANCEL(2) AXIS(axis_traverse)
            x = 0
        ENDIF
    ENDIF
ENDIF
RETURN

auto_moves:
IF material_start_pos > 0 AND material_end_pos > material_start_pos THEN
    IF (zone_control_enable = 1 AND zone_end_distance_pct > 0 AND zone1_traverse_speed > 0) OR _
            zone_pump_control_enable = 1 THEN
        GOSUB zone_auto_moves
    ELSE
        MOVEABS(material_end_pos)
        WAIT IDLE
        MOVEABS(material_start_pos)
        WAIT IDLE
    ENDIF
ENDIF
RETURN

zone_auto_moves:
'Calculate zone boundaries
total_distance = material_end_pos - material_start_pos
zone_distance = total_distance * (zone_end_distance_pct / 100)
boundary_l = material_start_pos + zone_distance
boundary_r = material_end_pos - zone_distance
'Store for HMI display
zone_boundary_l = boundary_l
zone_boundary_r = boundary_r
'---- Forward stroke (start -> end) ----
IF zone_control_enable = 1 THEN
    SPEED = zone1_traverse_speed
ENDIF
zone_current = 1
MOVEABS(material_end_pos)
WA(2) 'Allow servo period to update MTYPE before checking

zone_fwd_loop:
    IF MTYPE AXIS(axis_traverse) = mtype_idle THEN GOTO zone_fwd_done
    'Check for auto-mode exit — cancel move and return if operator stopped
    IF triocontrolword_vr.automode = 0 THEN
        CANCEL(2) AXIS(axis_traverse)
        zone_current = 0
        GOTO zone_fwd_done
    ENDIF
    current_pos = MPOS AXIS(axis_traverse)
    'Transition: end zone -> center (crossed boundary_L going forward)
    IF zone_current = 1 AND current_pos >= boundary_l THEN
        IF zone_control_enable = 1 THEN
            SPEED = traverse_speed_setpt
        ENDIF
        zone_current = 2
    ENDIF
    'Transition: center -> end zone (crossed boundary_R going forward)
    IF zone_current = 2 AND current_pos >= boundary_r THEN
        IF zone_control_enable = 1 THEN
            SPEED = zone3_traverse_speed
        ENDIF
        zone_current = 3
    ENDIF
    GOSUB speed_change
    WA(5)
GOTO zone_fwd_loop

zone_fwd_done:

'---- Reverse stroke (end -> start) ----
'Skip reverse if auto mode was cancelled
IF triocontrolword_vr.automode = 0 THEN GOTO zone_exit
IF zone_control_enable = 1 THEN
    SPEED = zone3_traverse_speed
ENDIF
zone_current = 3
MOVEABS(material_start_pos)
WA(2) 'Allow servo period to update MTYPE before checking

zone_rev_loop:
    IF MTYPE AXIS(axis_traverse) = mtype_idle THEN GOTO zone_rev_done
    'Check for auto-mode exit — cancel move and return if operator stopped
    IF triocontrolword_vr.automode = 0 THEN
        CANCEL(2) AXIS(axis_traverse)
        zone_current = 0
        GOTO zone_rev_done
    ENDIF
    current_pos = MPOS AXIS(axis_traverse)
    'Transition: end zone -> center (crossed boundary_R going reverse)
    IF zone_current = 3 AND current_pos <= boundary_r THEN
        IF zone_control_enable = 1 THEN
            SPEED = traverse_speed_setpt
        ENDIF
        zone_current = 2
    ENDIF
    'Transition: center -> end zone (crossed boundary_L going reverse)
    IF zone_current = 2 AND current_pos <= boundary_l THEN
        IF zone_control_enable = 1 THEN
            SPEED = zone1_traverse_speed
        ENDIF
        zone_current = 1
    ENDIF
    GOSUB speed_change
    WA(5)
GOTO zone_rev_loop

zone_rev_done:
zone_exit:
'Restore traverse speed to setpoint so next cycle starts clean
SPEED = traverse_speed_setpt
RETURN

