'Demo cell -- autorun program
'Synthetic example project for the simulator and HMI tools. It is not a
'real machine: a cell with START/STOP/RESET, a speed setpoint that the
'actual speed ramps to, a part counter, jog/home on one axis, and a fault.
'VR map (matches skills/trio-hmi-screens/assets/examples/demo-cell.json):
'  VR(10) command word  .0 START  .1 STOP  .2 RESET   (one-shot, cleared here)
'  VR(11) status word   .0 RUNNING  .1 FAULT  .2 HOMED
'  VR(12) jog word      .0 JOG+  .1 JOG-  .2 HOME
'  VR(20) options       .0 vacuum  .1 coolant  .2 auto-restart
'  VR(50) alarms        .0 drive fault
'  VR(100..106) speed setpoint, actual speed, position, jog speed,
'               part count, batch size, dwell time

GLOBAL "cmd_word", 10
GLOBAL "status_word", 11
GLOBAL "jog_word", 12
GLOBAL "options_word", 20
GLOBAL "alarm_word", 50
GLOBAL "speed_sp", 100
GLOBAL "speed_actual", 101
GLOBAL "position", 102
GLOBAL "jog_speed", 103
GLOBAL "part_count", 104
GLOBAL "batch_size", 105
GLOBAL "dwell_ms", 106

CONSTANT "proc_cell", 2
CONSTANT "proc_jog", 3

'Power-on defaults
cmd_word = 0
status_word = 0
jog_word = 0
alarm_word = 0
speed_sp = 50
speed_actual = 0
position = 0
jog_speed = 10
part_count = 0
batch_size = 20
dwell_ms = 250

WDOG = ON
RUN "CELL_LOGIC", proc_cell
RUN "JOG_LOGIC", proc_jog
