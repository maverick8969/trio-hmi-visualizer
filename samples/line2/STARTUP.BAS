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
