'Register position mode to rising edge of switch
BASE(axis_traverse)
REGIST(0)
'Mode, channel, input, edge, window
REGIST(20, in_belt_slip_sensor, 4, 0)
REG_INPUTS = in_belt_slip_sensor

WAIT UNTIL MARK
posdiff = belt_slip_sensor_location - REG_POS
IF posdiff > ABS(.2) AND posdiff < ABS(.5) THEN
    OFFPOS = posdiff
ENDIF
