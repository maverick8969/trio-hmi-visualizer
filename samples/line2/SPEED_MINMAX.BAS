minspeeda = 100
maxspeeda = 0
minspeedb = 100
maxspeedb = 0
minspeedc = 100
maxspeedc = 0
DIM mintimea AS STRING(32)
DIM mintimeb AS STRING(32)
DIM mintimec AS STRING(32)
DIM maxtimea AS STRING(32)
DIM maxtimeb AS STRING(32)
DIM maxtimec AS STRING(32)
pgm_loop:
'IF MTYPE AXIS(axis_traverse) > mtype_idle THEN
IF ATYPE AXIS(axis_pump_a) <> mtype_idle THEN
    BASE(axis_pump_a)
    IF MTYPE > mtype_idle THEN
        IF MSPEED > maxspeeda THEN
            maxspeeda = MSPEED
            maxtimea = TIME$
        ENDIF
        IF MSPEED < minspeeda THEN
            minspeeda = MSPEED
            mintimea = TIME$
        ENDIF
        speeddiffa = maxspeeda - minspeeda
    ENDIF
ENDIF
IF ATYPE AXIS(axis_pump_b) <> mtype_idle THEN
    BASE(axis_pump_b)
    IF MSPEED > maxspeedb THEN
        maxspeedb = MSPEED
        maxtimeb = TIME$
    ENDIF
    IF MTYPE > mtype_idle THEN
        IF MSPEED < minspeedb THEN
            minspeedb = MSPEED
            mintimeb = TIME$
        ENDIF
        speeddiffb = maxspeedb - minspeedb
        WA(10)
    ENDIF
ENDIF
IF ATYPE AXIS(axis_pump_c) <> mtype_idle THEN
    BASE(axis_pump_c)
    IF MTYPE > mtype_idle THEN
        IF MSPEED > maxspeedc THEN
            maxspeedc = MSPEED
            maxtimec = TIME$
        ENDIF
        IF MSPEED < minspeedc THEN
            minspeedc = MSPEED
            mintimec = TIME$
            speeddiffc = maxspeedc - minspeedc
            WA(10)
        ENDIF
    ENDIF
ENDIF
pumpa_torque = DRIVE_TORQUE AXIS(axis_pump_a) / 10
pumpb_torque = DRIVE_TORQUE AXIS(axis_pump_b) / 10
pumpc_torque = DRIVE_TORQUE AXIS(axis_pump_c) / 10

IF pumpa_torque < 400 AND pumpa_torque > pumpa_max_torque THEN pumpa_max_torque = pumpa_torque
IF pumpb_torque < 400 AND pumpb_torque > pumpb_max_torque THEN pumpb_max_torque = pumpb_torque
IF pumpc_torque < 400 AND pumpc_torque > pumpc_max_torque THEN pumpc_max_torque = pumpc_torque
IF areset THEN
    minspeeda = 100
    maxspeeda = 0
    pumpa_max_torque = 0
ENDIF
IF breset THEN
    minspeedb = 100
    maxspeedb = 0
    pumpb_max_torque = 0
ENDIF
IF creset THEN
    minspeedc = 100
    maxspeedc = 0
    pumpc_max_torque = 0
ENDIF
GOTO pgm_loop

