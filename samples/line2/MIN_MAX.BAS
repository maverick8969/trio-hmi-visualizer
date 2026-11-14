DIM a_min_flow AS FLOAT
DIM a_max_flow AS FLOAT
DIM b_min_flow AS FLOAT
DIM b_max_flow AS FLOAT

GOSUB reset_flow

pgm_loop:
IF pumpa_meter_mass_flow_gpersec < a_min_flow * 100 THEN a_min_flow = pumpa_meter_mass_flow_gpersec / 100
IF pumpa_meter_mass_flow_gpersec > a_max_flow * 100 THEN a_max_flow = pumpa_meter_mass_flow_gpersec / 100
IF pumpb_meter_mass_flow_gpersec < b_min_flow * 100 THEN b_min_flow = pumpb_meter_mass_flow_gpersec / 100
IF pumpb_meter_mass_flow_gpersec > b_max_flow * 100 THEN b_max_flow = pumpb_meter_mass_flow_gpersec / 100

IF MSPEED AXIS(axis_pump_a) * 60 < a_pump_min_rpm THEN a_pump_min_rpm = MSPEED AXIS(axis_pump_a) * 60
IF MSPEED AXIS(axis_pump_a) * 60 > a_pump_max_rpm THEN a_pump_max_rpm = MSPEED AXIS(axis_pump_a) * 60
IF MSPEED AXIS(axis_pump_b) * 60 < b_pump_min_rpm THEN b_pump_min_rpm = MSPEED AXIS(axis_pump_b) * 60
IF MSPEED AXIS(axis_pump_b) * 60 > b_pump_max_rpm THEN b_pump_max_rpm = MSPEED AXIS(axis_pump_b) * 60
IF btn_reset THEN GOSUB reset_flow
GOTO pgm_loop

reset_flow:
btn_reset = 0
a_min_flow = 9999
a_max_flow = 0
b_min_flow = 9999
b_max_flow = 0
a_pump_min_rpm = 9999
a_pump_max_rpm = 0
b_pump_min_rpm = 9999
b_pump_max_rpm = 0
RETURN
