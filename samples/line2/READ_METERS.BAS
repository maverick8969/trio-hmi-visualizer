
'Seem to need time when starting Trio programs
WA(1000)
pumpa_meter_modbus_open_error = 1
pumpb_meter_modbus_open_error = 1
pumpa_meter_modbus_read_error = 1
pumpb_meter_modbus_read_error = 1
pumpa_meter_error_count = 0
pumpb_meter_error_count = 0
'GOSUB close_a_port
'GOSUB close_b_port
GOSUB open_a_port
GOSUB open_b_port
'GOSUB open_b_port

read_loop:
'Read pump A meter if port was opened
IF pumpa_meter_modbus_open_error = 0 THEN
    GOSUB read_pumpa
    WA(200)
ENDIF
'Read pump B meter if port was opened
IF pumpb_meter_modbus_open_error = 0 THEN
    GOSUB read_pumpb
    WA(200)
ENDIF
GOTO read_loop

close_a_port:
'Check if pump A Modbus is open and close
IF MODBUS(modbus_function_status, trio_communications_slot, VR(pumpa_meter_modbus_handle)) THEN
    MODBUS(modbus_function_close_port, trio_communications_slot, VR(pumpa_meter_modbus_handle))
ENDIF
RETURN

close_b_port:
'*********************** THIS CANNOT BE USED OR WILL CLOSE THE PORT FOR PUMP A ******************
'Check if pump B Modbus is open and close
IF MODBUS(modbus_function_status, trio_communications_slot, VR(pumpb_meter_modbus_handle)) THEN
    MODBUS(modbus_function_close_port, trio_communications_slot, VR(pumpb_meter_modbus_handle))
ENDIF
RETURN

open_a_port:
'Open pump A Modbus port
IF MODBUS(modbus_function_open_port, trio_communications_slot, _
        pumpa_meter_ip1, pumpa_meter_ip2,pumpa_meter_ip3, pumpa_meter_ip4, _
        trio_modbus_port, 600) = TRUE THEN
    pumpa_meter_modbus_open_error = 0
ELSE
    pumpa_meter_modbus_open_error = 1
ENDIF
RETURN

open_b_port:
'Open pump B Modbus port
IF MODBUS(modbus_function_open_port, trio_communications_slot, _
        pumpb_meter_ip1, pumpb_meter_ip2,pumpb_meter_ip3, pumpb_meter_ip4, _
        trio_modbus_port, 630) = TRUE THEN
    pumpb_meter_modbus_open_error = 0
ELSE
    pumpb_meter_modbus_open_error = 1
ENDIF
RETURN

'Pump A read subroutine
read_pumpa:
IF MODBUS (modbus_function_send_command, trio_communications_slot, VR(pumpa_meter_modbus_handle), _
        modbus_command_read_registers , meter_source_start_word , meter_words_to_read, pumpa_meter_start_word) THEN
    pumpa_meter_modbus_read_error = 0
ELSE
    pumpa_meter_modbus_read_error = 1
    pumpa_meter_error_count = pumpa_meter_error_count + 1
ENDIF
'Read lifetime totalizer separately (meter reg 10, kg) into VR 620.
'New meters no longer publish the total at reg 6 -- see START_AND_SET_VARIABLES.BAS
'CONSTANT Meter_Total_Source_Start / Meter_Total_Words_To_Read / PumpA_Meter_Total_VR.
MODBUS (modbus_function_send_command, trio_communications_slot, VR(pumpa_meter_modbus_handle), _
        modbus_command_read_registers, meter_total_source_start, meter_total_words_to_read, pumpa_meter_total_vr)
RETURN

'Pump B read subroutine
read_pumpb:
IF MODBUS (modbus_function_send_command, trio_communications_slot, VR(pumpb_meter_modbus_handle), _
        modbus_command_read_registers , meter_source_start_word , meter_words_to_read, pumpb_meter_start_word) THEN
    pumpb_meter_modbus_read_error = 0
ELSE
    pumpb_meter_modbus_read_error = 1
    pumpb_meter_error_count = pumpb_meter_error_count + 1
ENDIF
'Read lifetime totalizer separately (meter reg 10, kg) into VR 650.
MODBUS (modbus_function_send_command, trio_communications_slot, VR(pumpb_meter_modbus_handle), _
        modbus_command_read_registers, meter_total_source_start, meter_total_words_to_read, pumpb_meter_total_vr)
RETURN
