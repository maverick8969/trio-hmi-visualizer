'Start Header Section
DIM naxis,nslot,naddress,coe_index,coe_sub_index,coe_type,vr_var,err_chan,vr_ethercat_state,nretry,nmaxretry AS INTEGER
DIM wr_err,need_reset,ethercat_result AS BOOLEAN
DIM coe_value AS FLOAT
'Stop Header Section
'Start Ethernet port section
' Modbus TCP port number
ETHERNET(1,-1,10,502)
' Modbus TCP
ETHERNET(1,-1,14,0,1,3)
ETHERNET(1,-1,14,0,2,2)
ETHERNET(1,-1,14,0,6,1)

' Enable comm port after the settings were applied
' A Corresponding IP_PROTOCOL_CTRL=12 command should be present in the MC_CONFIG program
IP_PROTOCOL_CTRL=0
'Stop Ethernet port section

'Start Trio RTD Section - Slot 0 Address 1003
'Check current EtherCAT slot state. It must be Safe-Operational or Operational
vr_ethercat_state = 3030 ' Use VR(3030) to store EtherCat State
ethercat_result = ETHERCAT($22, 0, vr_ethercat_state)
IF ethercat_result <> TRUE OR (VR(vr_ethercat_state) <> 2 AND VR(vr_ethercat_state) <> 3) THEN
    PRINT#5,"EtherCAT network on slot 0 not ready!"
    GOTO rtd_slot_0_addr_1003_end
ENDIF
'Check Vendor ID
vr_vendor_id = 3030 ' Use VR(3030) to store vendor ID
nmaxretry = 10
nretry = 0
WHILE nretry < nmaxretry
    ethercat_result = CO_READ(0, 1003, $1018, 1, 7, vr_vendor_id)
    IF ethercat_result <> FALSE THEN
        IF VR(vr_vendor_id) <> 734 THEN
            GOTO rtd_slot_0_addr_1003_end
        ENDIF
        nretry = nmaxretry
    ELSE
        nretry = nretry + 1
        IF nretry > nmaxretry - 1 THEN
            PRINT#5,"Error accessing device on slot 0, address 1003"
            GOTO rtd_slot_0_addr_1003_end
        ENDIF
    ENDIF
WEND
'Check Product ID
vr_product_id = 3030 ' Use VR(3030) to store product ID
nmaxretry = 10
nretry = 0
WHILE nretry < nmaxretry
    ethercat_result = CO_READ(0, 1003, $1018, 2, 7, vr_product_id)
    IF ethercat_result <> FALSE THEN
        IF VR(vr_product_id) <> 368 THEN
            GOTO rtd_slot_0_addr_1003_end
        ENDIF
        nretry = nmaxretry
    ELSE
        nretry = nretry + 1
        IF nretry > nmaxretry - 1 THEN
            PRINT#5,"Error accessing device on slot 0, address 1003"
            GOTO rtd_slot_0_addr_1003_end
        ENDIF
    ENDIF
WEND
vr_var = 0:err_chan = 5:need_reset=FALSE

naxis=-1:nslot=0:naddress=1003:
coe_index=$8000:coe_sub_index=$01:coe_type=2:coe_value=0:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8000:coe_sub_index=$04:coe_type=2:coe_value=0:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8010:coe_sub_index=$01:coe_type=2:coe_value=0:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8010:coe_sub_index=$04:coe_type=2:coe_value=1:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8020:coe_sub_index=$01:coe_type=2:coe_value=0:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8020:coe_sub_index=$04:coe_type=2:coe_value=2:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8030:coe_sub_index=$01:coe_type=2:coe_value=-1:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end
coe_index=$8030:coe_sub_index=$04:coe_type=2:coe_value=-1:need_reset=FALSE:
GOSUB rtd_do_param:IF wr_err THEN GOTO rtd_the_end

rtd_slot_0_addr_1003_end:

'Stop Trio RTD Section - Slot 0 Address 1003

'Start Trio RTD Write Parameters Section
GOTO rtd_the_end
rtd_do_param:

nmaxretry = 10

nretry = 0
WHILE nretry < nmaxretry
    retval=CO_READ(nslot,naddress,coe_index,coe_sub_index,coe_type,vr_var)
    IF retval <> 0 THEN
        nretry = nmaxretry
    ELSE
        nretry = nretry + 1
        IF nretry > nmaxretry - 1 THEN GOTO rtd_handle_error
    ENDIF
WEND

IF VR(vr_var) <> coe_value THEN
    nretry = 0
    WHILE nretry < nmaxretry
        retval=CO_WRITE(nslot,naddress,coe_index,coe_sub_index,coe_type,-1,coe_value)
        IF retval<>0 THEN
            nretry = nmaxretry
        ELSE
            nretry = nretry + 1
            IF nretry > nmaxretry - 1 THEN GOTO rtd_handle_error
        ENDIF
    WEND
ENDIF
RETURN

rtd_handle_error:
wr_err = TRUE
PRINT#err_chan,"Error accessing device on slot ";nslot;" address ";naddress

' Show device error on controller display
' Requires new command(s) in firmware
RETURN

rtd_the_end:
'Stop Trio RTD Write Parameters Section
