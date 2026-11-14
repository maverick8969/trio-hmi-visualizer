'Demo cell -- hold-to-run jog and homing (50 ms scan). Jog is ignored while running.
WHILE TRUE
    IF READ_BIT(0, 11) = 0 THEN
        IF READ_BIT(0, 12) THEN
            position = position + jog_speed * 0.05
        ENDIF
        IF READ_BIT(1, 12) THEN
            position = position - jog_speed * 0.05
        ENDIF
    ENDIF

    IF READ_BIT(2, 12) THEN
        CLEAR_BIT(2, 12)
        position = 0
        SET_BIT(2, 11)
    ENDIF

    WA(50)
WEND
