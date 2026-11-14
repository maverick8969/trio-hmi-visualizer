'Demo cell -- run/stop/fault logic, speed ramp and part counter (100 ms scan)
count_ticks = 0

WHILE TRUE
    'A drive fault latches FAULT and stops the cell
    IF READ_BIT(0, 50) THEN
        SET_BIT(1, 11)
        CLEAR_BIT(0, 11)
    ENDIF

    'START: acknowledge, run only when not faulted
    IF READ_BIT(0, 10) THEN
        CLEAR_BIT(0, 10)
        IF READ_BIT(1, 11) = 0 THEN
            SET_BIT(0, 11)
        ENDIF
    ENDIF

    'STOP
    IF READ_BIT(1, 10) THEN
        CLEAR_BIT(1, 10)
        CLEAR_BIT(0, 11)
    ENDIF

    'RESET: clear fault, alarm and count
    IF READ_BIT(2, 10) THEN
        CLEAR_BIT(2, 10)
        CLEAR_BIT(1, 11)
        CLEAR_BIT(0, 50)
        part_count = 0
    ENDIF

    'Speed ramps toward the setpoint while running, coasts down when stopped
    IF READ_BIT(0, 11) THEN
        speed_actual = speed_actual + (speed_sp - speed_actual) * 0.25
        count_ticks = count_ticks + 1
        IF count_ticks >= 10 THEN
            count_ticks = 0
            part_count = part_count + 1
        ENDIF
    ELSE
        speed_actual = speed_actual * 0.6
        IF speed_actual < 0.05 THEN
            speed_actual = 0
        ENDIF
    ENDIF
    position = position + speed_actual * 0.1

    'Batch complete: restart the count (auto-restart) or stop
    IF batch_size > 0 AND part_count >= batch_size THEN
        IF READ_BIT(2, 20) THEN
            part_count = 0
        ELSE
            CLEAR_BIT(0, 11)
        ENDIF
    ENDIF

    WA(100)
WEND
