useinpermin = TRUE
button_increment = .01
TICKS = 1000
pgm_loop:
BASE(axis_niproll)
GOSUB nip_control
GOSUB set_nip_speed
GOSUB product_length_calc

GOTO pgm_loop

nip_control:
IF niproll_controlword_vr.controlbitreverse = 0 THEN
    nip_roll_speed_word = (nip_speed_setpt / niproll_inch_per_min_hz) * 10
ELSE
    nip_roll_speed_word = ((nip_speed_setpt / niproll_inch_per_min_hz) * 10) * -1
ENDIF

IF READ_BIT(nip_roll_status_running_bit, 5000) THEN
    nipimagegreen = 1
ELSE
    nipimagegreen = 0
ENDIF
RETURN

set_nip_speed:
BASE(axis_niproll)
IF nip_increment THEN
    nip_increment = FALSE
    nip_speed_setpt = nip_speed_setpt+ button_increment
    IF nip_speed_setpt > 100 THEN nip_speed_setpt = 100
    'bufferpinchroll_speed = nip_speed_setpt
    WA(1000) 'incase holding switch
ENDIF
IF nip_decrement THEN
    nip_decrement = FALSE
    nip_speed_setpt = nip_speed_setpt - button_increment
    IF nip_speed_setpt < 0 THEN nip_speed_setpt = 0
    WA(1000) 'incase holding switch
ENDIF

'Trio axis units is inches per second and user unit is inches per minute
IF nip_speed_setpt > 0 THEN
'Check if pumps sync'd to nip roll is set and nip speed setpoint has changed
    IF nip_speed_setpt <> last_nip_speed_setpt AND last_nip_speed_setpt > 0 THEN
        'Get percent of setpt change and to apply percent to pump A speed
        nip_percent_speed_change = nip_speed_setpt / last_nip_speed_setpt
        'Set flag for pump A to change gal/hr value by same percent
        IF sync_pump_speeds_to_nip = TRUE THEN pumpa_adjust_to_nip_change = TRUE
    ENDIF
    last_nip_speed_setpt = nip_speed_setpt
ENDIF
RETURN

product_length_calc:
BASE(axis_niproll)
IF product_length_reset = 1 THEN
    product_length_reset = 0
    product_length = 0
    production_seconds = 0
    operator_shift_done = 0 'Starting a new run clears the end-of-shift flag
    TICKS = 1000
ENDIF
'No encoder on product or pinch roll shaft.  Calculate based on inches per second speed and time since
'reset.  Every second add an inch noting length to operator is in feet.
IF READ_BIT(nip_roll_status_running_bit, 5000) AND MTYPE AXIS(axis_traverse) <> mtype_idle AND _
        MTYPE AXIS(axis_pump_a) <> mtype_idle AND operator_shift_done = 0 THEN
    IF TICKS < 1 THEN
        'Speed setpoint is inches per minute, but trio motor speed is in inches/second.
        last_product_length = product_length
        product_length = product_length + (nip_speed_setpt / 60) / 12
        diff = last_product_length - product_length
        production_seconds = production_seconds + 1
        TICKS = 1000
    ENDIF
ENDIF
RETURN
