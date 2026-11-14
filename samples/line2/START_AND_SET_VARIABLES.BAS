'Novex Line 2

'HiTech Computing
'Gary Hammitt
'1/2/2025; Updated from Nidec to Trio drives and Optidrive VFD

'***** Modbus TCP server configuration *****
'Configures the controller's built-in Ethernet port as a Modbus TCP slave
'on port 502 with a direct register-to-VR mapping (Modbus reg N -> VR N,
'NO address halving).  This MUST run before any program reads or writes
'a VR over Modbus, so it lives at the top of the autorun program.
'
'Previously these calls lived in STARTUP.BAS, which was never registered
'in Novex Line 2.mpv3prj and therefore never ran on controller boot;
'after a power cycle the Modbus server would accept TCP connections but
'reject every FC03 read, leaving the dashboard poller stuck on STALE.
'See Docs/Modbus_TCP_Integration.md section 2 for the original layout.
'
'Address halving (ETHERNET(1,-1,14,0,6,1)) is intentionally OMITTED so
'register addresses match VR numbers 1:1, which is what kpi_board's
'poll.py and the SHARE_DATA block (VR 4000-4023) assume.
ETHERNET(1,-1,10,502) 'Modbus TCP port = 502
ETHERNET(1,-1,14,0,1,3) 'Map incoming Modbus data to VR table
ETHERNET(1,-1,14,0,2,2) 'Enable 32-bit float pairs
IP_PROTOCOL_CTRL = 0 'Apply settings, enable port

CONSTANT "debug",FALSE

CONSTANT "debugport", 5
'Servo axes numbers
CONSTANT "AXIS_TRAVERSE", 0
CONSTANT "AXIS_PUMP_A", 1
CONSTANT "AXIS_PUMP_B", 2
CONSTANT "AXIS_PUMP_C", 3
'Nip roll could be EtherCAT axis but using analog output control so do not shut down
'nip roll if pump or traverse axes errors (EtherCAT shutdown).  Nip roll is on separate EStop
CONSTANT "AXIS_NIPROLL", 4
CONSTANT "AXIS_MIXER", 5 'Not  used
'Trio Process numbers for each program used to check program (process) status
'HMI using process 4
CONSTANT "Proc_Thermocouple_Config", 1
CONSTANT "Proc_Init_Parameters", 2
CONSTANT "Proc_HMI_Animation", 3
CONSTANT "Proc_Error_Check", 4
CONSTANT "Proc_Recipes", 5
CONSTANT "Proc_NIP_Roll", 6
CONSTANT "Proc_Traverse", 7
CONSTANT "Proc_Manual", 8
CONSTANT "Proc_Auto", 9
CONSTANT "Proc_Mixer", 10
CONSTANT "Proc_Calibration", 11
CONSTANT "proc_pumps_run", 12
CONSTANT "Proc_Read_Meters", 13
CONSTANT "Proc_Pumps_PID", 14
CONSTANT "Proc_Heater_OffOn", 15
CONSTANT "Proc_ADISRA_data", 16
CONSTANT "Proc_Share_Data", 17

CONSTANT "In_Safety_EStop", 0 '(689)
CONSTANT "In_TraverseHome", 1 '(819)
CONSTANT "In_Traverse_RSLimit", 2 '(825)
CONSTANT "In_Mixer_Running", 3 '( )

'Analog input card
CONSTANT "AnalogIn_Mixer_Speed_Ref", 8

CONSTANT "AnalogIn_Mixhead_DeltaP_A_RTD", 0
CONSTANT "AnalogIn_Mixhead_DeltaP_B_RTD", 1
CONSTANT "AnalogIn_Mixhead_RTD", 2
'Spare input 4 not configured

'On line 2, less heat control since in separate control enclosure.  Only new overhead heater
'controlled by Trio
'Thermocouple card
CONSTANT "AnalogIn_Overhead_Heater_1", 5
CONSTANT "AnalogIn_Overhead_Heater_2", 6
CONSTANT "AnalogIn_Overhead_Heater_3", 7

'Leave for reference until remove wiring from I/O modules and terminals
'CONSTANT "in_traversehome_os2", 1
'CONSTANT "In_PumpsRun_OS1", 3
'CONSTANT "In_PumpsPurge_OS1", 4
'CONSTANT "In_NipRollRun_OS1", 5
'CONSTANT "In_NipRollRun_OS2", 6
'CONSTANT "In_NipRollStop_OS1", 7
'CONSTANT "In_NipRollStop_OS2", 8
'CONSTANT "In_NipRollForward", 9
'Not that nip roll is not on EtherCat because don't want to shut down on EtherCAt
'error (could have used VFD instead of EtherCat servo drive).
'CONSTANT "In_NipRunning", 10
'CONSTANT "In_NipFaulted" 11
'CONSTANT "In_NipEStop", 12
'CONSTANT "In_NipSpeedPlus_OS1", 13
'CONSTANT "In_NipSpeedMinus_OS1", 14
'CONSTANT "In_NipSpeedPlus_OS2", 15
'CONSTANT "In_NipSpeedMinus_OS2", 16

'CONSTANT "In_NipClose_OS1", 17
'CONSTANT "In_EmptyNip_OS1", 18
'CONSTANT "In_Belt_Slip_Sensor", 20 'Now used to reset position if belt slipping

CONSTANT "Out_MixerRun", 0
CONSTANT "Out_EStop_Reset", 4 'Energizes relay to close contact for safety relay reset terminals
CONSTANT "Out_WatchDog", 5 'Output is internal Trio WDOG is on
CONSTANT "Out_NipRollDown", 6 'Future use
CONSTANT "Out_MIXER_DELTAP_A_TC", 7
CONSTANT "Out_Mixer_DeltaP_B_TC", 8
CONSTANT "Out_Mixer_Head_TC", 9
CONSTANT "Out_Mixer_Lube", 10
CONSTANT "Out_PumpsPurgeSol1", 11
CONSTANT "Out_PumpsPurgeSol2", 12

'No stack light as of 1/13/2025
CONSTANT "Out_StackLight_Red", 16
CONSTANT "Out_StackLight_Yellow", 17
CONSTANT "Out_StackLight_Green", 18
CONSTANT "Out_StackLight_Horn", 19

CONSTANT "out_preoverhead_zone1_tc", 20
CONSTANT "out_preoverhead_zone2_hose_tc", 21
CONSTANT "out_preoverhead_zone3_hose_tc", 22

CONSTANT "AnalogOut_Mixer_Head_Speed", 6
CONSTANT "AnalogOut_Kevlar_Heater", 7
CONSTANT "Analog_Range", 2048

'Leave for reference until remove wiring from I/O modules and terminals
'CONSTANT "Out_TraverseRun", 1
'CONSTANT "Out_PumpsRun", 2
'CONSTANT "Out_PumpsPurge", 3
'CONSTANT "Out_WatchDog", 4 'Output is internal Trio WDOG is on
'CONSTANT "Out_LevelPermissive", 5 'To permissive relay for 120 VAC solenoid

'These output on seperate power to disable nip roll when nip Estop relay dropped out
'CONSTANT "Out_NipRollForward", 8
'CONSTANT "Out_NipRollReverse", 9
'CONSTANT "Out_NipRollDown", 10 'Future use
'CONSTANT "out_niprollrunningLt", 11

'CONSTANT "AnalogOut_NipSpeed", 0
'CONSTANT "AnalogOut_SpeedMeterOS1", 1
'CONSTANT "AnalogOut_SpeedMeterOS2", 2
'Added Infranor EtherCAT servo drive for mixer, so analog out for mixer not needed.  Here just incase ...
'CONSTANT "AnalogOut_MixerSpeed", 3


'Belt slip sensor location to re-register position (not used)
'CONSTANT "Belt_Slip_Sensor_Location", 51.6589

'Axis move types referenced by name
CONSTANT "Mtype_Idle", 0
CONSTANT "Mtype_Move", 1
CONSTANT "Mtype_MoveAbs", 2
CONSTANT "Mtype_Forward", 10
CONSTANT "Mtype_Reverse", 11
CONSTANT "Mtype_Connect", 21
CONSTANT "Mtype_MoveLink", 22

'Encoder counts and gearing to calculate trio UNITS
CONSTANT "Traverse_EncoderCount", 8388607
CONSTANT "PumpA_EncoderCount", 1048576
CONSTANT "PumpB_EncoderCount", 8388607
CONSTANT "PumpC_EncoderCount", 8388607
CONSTANT "Mixer_EncoderCount", 8388607 'Running open speed loop, not used at this time
CONSTANT "NipRoll_EncoderCount", 2048 'ppr 8192 quadrature

'Mixer is running velocity open loop mode, using DAC value as speed sent via EtherCAT
CONSTANT "mixer_dac_max", 2048
CONSTANT "mixer_max_speed", 18000

'Default parameters used on startup when value is set to zero
'Default gear ratios that if none assigned.  Otherwise set from machine parameters
CONSTANT "Traverse_PulleyDia" 2.631496
CONSTANT "Traverse_GearRatio", 5 'Gearbox
'CONSTANT "Traverse_TimingBeltRatio", 1.166666
CONSTANT "PumpA_GearRatio", 10
CONSTANT "PumpB_GearRatio", 10
CONSTANT "PumpC_GearRatio", 1 '20 changed to kicker pump temporarily
CONSTANT "Mixer_GearRatio", 1 'No gearing; shaft direct to mixer
CONSTANT "NipRoll_GearRatio", 244.7 'rated at 250:1 but adjusted for calibration
CONSTANT "NipRoll_Diameter", 15.71655
CONSTANT "NipRoll_Motor_Max_RPM", 1160 'At maximum driver hertz
CONSTANT "NipRoll_Drive_Max_Hz", 60 'Maximum drive hertz/sec

CONSTANT "PumpMaxRPM", 200

'Default speeds and accel/decel if none assigned.  Otherwise set from machine parameters
'Set accel and decel defaults set to same as default rpm
CONSTANT "Traverse_DefaultSpeed", 4 'Inches/Sec
CONSTANT "PumpA_DefaultSpeed", 10 'RPM
CONSTANT "PumpB_DefaultSpeed", 10 'RPM
CONSTANT "PumpC_DefaultSpeed", 10 'RPM
CONSTANT "Mixer_DefaultSpeed", 8000 'rpm
CONSTANT "NipRoll_DefaultSpeed", 1 'Inch/Min

'Following error range and limit
CONSTANT "Traverse_FERange", .1
CONSTANT "Traverse_FELimit", .2
CONSTANT "Traverse_RSLimit", -10
CONSTANT "PumpA_FERange", .1
CONSTANT "PumpA_FELimit", .2
CONSTANT "PumpB_FERange", .1
CONSTANT "PumpB_FELimit", .2
CONSTANT "PumpC_FERange", .1
CONSTANT "PumpC_FELimit", .2
'Mixer running open loop, but here in case would add encoder cable
CONSTANT "Mixer_FERange", .1
CONSTANT "Mixer_FELimit", .1
CONSTANT "NipRoll_FERange", .1
CONSTANT "NipRoll_RELimit", .2

'Trio control word (VR memory), followed by control bits
GLOBAL "TrioControlWord_VR", 1
'Control word bits (zero based)
CONSTANT "DisableWDOGBit", 0 'From HMI user control
CONSTANT "AutoMode", 1
CONSTANT "AutoRunActive", 2

'Axis control words (VR memory locations), followed by control bit assignments
GLOBAL "Traverse_ControlWord_VR", 2
GLOBAL "PumpA_ControlWord_VR", 3
GLOBAL "PumpB_ControlWord_VR", 4
GLOBAL "PumpC_ControlWord_VR", 5
GLOBAL "NipRoll_ControlWord_VR", 6
GLOBAL "Mixer_ControlWord_VR", 7

'Axis control word value to set proper bits checked in bitset
'Since cannot do Set_Bit function in HMI as an executable Trio basis line of code
CONSTANT "ControlBitJogFwd" 0 'Jog forward
CONSTANT "ControlBitJogRev" 1 'Jog reverse
CONSTANT "ControlBitMoveRel" 2 'Set to move relative, otherwise default to absolute
CONSTANT "ControlBitInitMove", 3 'Initialize an absolute or relative move
CONSTANT "ControlBitCancelMove", 4
CONSTANT "ControlBitHome", 5
CONSTANT "ControlBitReverse", 6 'For nip roll check box

'Axis status (Nor Trio Axisstaus) words (VR memory locations), followed by status bit assigbments
GLOBAL "Traverse_StatusWord_VR", 10
GLOBAL "PumpA_StatusWord_VR", 11
GLOBAL "PumpB_StatusWord_VR", 12
GLOBAL "PumpC_StatusWord_VR", 14
GLOBAL "Mixer_StatusWord_VR", 15
GLOBAL "NipRoll_StatusWord", 16
'Axis status word bits (zero based)
CONSTANT "StatusBitInPos", 0 'In position
CONSTANT "StatusBitMoving", 1
CONSTANT "StatusBitDriveFault", 2
CONSTANT "StatusBitHoming", 3
CONSTANT "StatusBitHomed", 4
CONSTANT "StatusBitError", 5

'AXISSTATUS error bits
CONSTANT "AxisStatusSpeedLimit", 0
CONSTANT "AxisStatusFollowingWarn", 1
CONSTANT "AxisStatusCommError", 2
CONSTANT "AxisStatusRemoteDrive", 3
CONSTANT "AxisStatusForwardEOT", 4
CONSTANT "AxisStatusReverseEOT", 5
CONSTANT "AxisStatusHoming", 6
CONSTANT "AxisStatusFreeHold", 7
CONSTANT "AxisStatusFollowingError", 8
CONSTANT "AxisStatusFSLIMIT", 9
CONSTANT "AxisStatusRSLIMIT", 10
CONSTANT "AxisStatusMoveCancel", 11

'Traverse value changed by operator status word
GLOBAL "ZoneChangeStatus_VR", 20
GLOBAL "TraverseDirection", 21

'Zone control status (written by TRAVERSE, read by HMI)
GLOBAL "zone_current", 120
GLOBAL "zone_boundary_L", 121
GLOBAL "zone_boundary_R", 122

'Status for operator messages.  SystemStatus is a BIT-PACKED status word
'(NOT an enum) — each constant below is the bit position used with the
'TrioBASIC `vr.N` bit-access syntax.  Mirror exposed at VR 4017 as
'Share_SystemStatus for the Modbus TCP dashboard.
GLOBAL "SystemStatus", 24
CONSTANT "Estop_Active", 0
CONSTANT "EtherCATStarting", 1
CONSTANT "EtherCATError", 2
CONSTANT "EtherCATStarted", 3
CONSTANT "EnablingDrives", 4
CONSTANT "DriveEnabled", 5
CONSTANT "EtherCATStopped", 6

'Traverse maximum travel in inches
CONSTANT "TraverseFullTravel", 100 'inches
CONSTANT "HomeFromTable", 6 'Inches from edge of table when home
'Table left side in pizels
CONSTANT "TableLeftPixels", 20
CONSTANT "TableWidthPixels", 676
'Traverse animation distances in pixels
CONSTANT "TraverseHomePosPixel", 716
CONSTANT "MixerHomePosPixel", 722
CONSTANT "MixerLabelPosPixel", 760
CONSTANT "TraverseFullTravelPixels", 752
CONSTANT "TraversePixelWidth", 44

GLOBAL "Trio_Program_Error", 30
GLOBAL "Program_Error_Lineno", 31

CONSTANT "Cm3PerGallon", 3785.412
'Calibration VR's
CONSTANT "Cal_PumpA_Revs_VR", 41
CONSTANT "Cal_PumpA_RPM_VR", 42
CONSTANT "PumpA_Actual", 43
CONSTANT "Cal_PumpB_Revs_VR", 44
CONSTANT "Cal_PumpB_RPM_VR", 45
CONSTANT "PumpB_Actual", 46
CONSTANT "Cal_PumpC_Revs_VR", 47
CONSTANT "Cal_PumpC_RPM_VR", 48
CONSTANT "PumpC_Actual", 49
CONSTANT "pumpb_to_a_calc_ratio_vr", 50
CONSTANT "pumpc_to_a_calc_ratio_vr", 51
CONSTANT "Cal_PumpA_Calc_Grams", 52
CONSTANT "Cal_PumpB_Calc_Grams", 53
CONSTANT "Cal_PumpC_Calc_Grams", 54
CONSTANT "Cal_PumpA_Spec", 55
CONSTANT "Cal_PumpB_Spec", 56
CONSTANT "Cal_PumpC_Spec", 57
CONSTANT "PumpA_Actual_Grams_Per_Rev_VR", 58
CONSTANT "PumpB_Actual_Grams_Per_Rev_VR", 59
CONSTANT "PumpC_Actual_Grams_Per_Rev_VR", 60

CONSTANT "pump_switch_override", 32

GLOBAL "PumpA_Actual_GPH_VR", 61
GLOBAL "PumpB_Actual_GPH_VR", 62
GLOBAL "PumpC_Actual_GPH_VR", 63

GLOBAL "Running_Pumpa_Calibration", 64
GLOBAL "Running_Pumpb_Calibration", 65
GLOBAL "Running_Pumpc_Calibration", 66

GLOBAL "Sync_PumpA_With_Traverse", 67
GLOBAL "Sync_Pump_Speeds_To_Nip", 68
GLOBAL "nip_percent_speed_change", 69
GLOBAL "PumpA_Adjust_To_Nip_Change", 70
GLOBAL "nip_speed_setpt", 71 'Used in nip roll program only for adjustment
GLOBAL "traverse_to_pump_min", 72

'Pump speed per flow meter calibration values
GLOBAL "PumpA_Calibrated_GalPerHr", 73
GLOBAL "PumpA_Calibrated_GramsPerSec", 74
GLOBAL "PumpA_RPM_Per_GalPerHr", 75
GLOBAL "PumpA_RPM_Per_GramsPerSec", 76
GLOBAL "PumpB_Calibrated_GalPerHr", 77
GLOBAL "PumpB_Calibrated_GramsPerSec", 78
GLOBAL "PumpB_RPM_Per_GalPerHr", 79
GLOBAL "PumpB_RPM_Per_GramsPerSec", 80

GLOBAL "Material_End_Pos", 92
GLOBAL "Traverse_Actual_To_Setpt_Speed", 93
GLOBAL "PumpA_GramsPerCm3", 94
GLOBAL "PumpB_GramsPerCm3", 95
GLOBAL "PumpC_GramsPerCm3", 96
GLOBAL "save_receipe", 97
GLOBAL "RecipeRowIndex", 98
GLOBAL "Material_Start_Pos", 99

'Working VR's copied from TABLE receipe data
GLOBAL "Recipe_No", 100
'If pump speed set to zero then program knows not being used and therefore not enabled on HMI
'GLOBAL "pumpa_grpsec_setpoint" 101 'Added when flow meteres added
GLOBAL "pumpa_rpm_setpoint", 101
GLOBAL "pumpb_mix_ratio", 102
GLOBAL "pumpc_mix_ratio", 103
'Traverse distance speed ,accel and decl
GLOBAL "traverse_speed_setpt", 104
GLOBAL "Traverse_Accel", 105
GLOBAL "Traverse_Decel", 106
GLOBAL "PinchRoll_Speed", 107
'Zone control — working parameters (loaded from recipe)
GLOBAL "zone_control_enable", 108
GLOBAL "zone_end_distance_pct", 109
GLOBAL "zone1_traverse_speed", 110
'Zone pump control — working parameters (loaded from recipe)
GLOBAL "zone_pump_control_enable", 111
GLOBAL "zone1_pump_pct", 112
GLOBAL "zone2_pump_pct", 113
'Zone 3 independent parameters (loaded from recipe)
GLOBAL "zone3_traverse_speed", 114
GLOBAL "zone3_pump_pct", 115

'Table memory for recipes used in HMI recipe data grid.  Since datagrid data source (table)
'is indexed by row rather than column, every 20th table word begin new recipe.
'Datagrid Column 1 rows  = table word 0 - 9 (Recipe_No)
'Datagrid Column 2 rows = table word 10 - 19 (pumpa_rpm_setpoint)
'etc.
CONSTANT "Recipe_Start_VR", 100

CONSTANT "TableRecipeStart", 0
CONSTANT "TableTotalRecipes", 20
CONSTANT "TableTotalRecipeItems", 16

CONSTANT "Recipe_Edit_Buffer_Start", 300

'Edit buffer data
GLOBAL "BufferRecipe_No", 300
'GLOBAL "BufferRecipe_Gr_Per_Sec", 301 'Added when flow meters added
GLOBAL "Bufferpumpa_Speed", 301
GLOBAL "Bufferpumpb_SpeedRatio", 302
GLOBAL "Bufferpumpc_SpeedRatio", 303
GLOBAL "Buffertraverse_speed_setpt", 304
GLOBAL "BufferTraverse_Accel", 305
GLOBAL "BufferTraverse_Decel", 306
GLOBAL "BufferPinchRoll_Speed", 307
'Zone control — recipe edit buffer
GLOBAL "buffer_zone_control_enable", 308
GLOBAL "buffer_zone_end_distance_pct", 309
GLOBAL "buffer_zone1_traverse_speed", 310
'Zone pump control — recipe edit buffer
GLOBAL "buffer_zone_pump_control_enable", 311
GLOBAL "buffer_zone1_pump_pct", 312
GLOBAL "buffer_zone2_pump_pct", 313
'Zone 3 independent — recipe edit buffer
GLOBAL "buffer_zone3_traverse_speed", 314
GLOBAL "buffer_zone3_pump_pct", 315

'Pump A PID speed control
CONSTANT "pumpa_speed_PID_in_start_word", 400
GLOBAL "pumpa_speed_PID_auto", pumpa_speed_pid_in_start_word
GLOBAL "pumpa_speed_PID_pv", pumpa_speed_pid_in_start_word + 1
GLOBAL "pumpa_speed_PID_sp", pumpa_speed_pid_in_start_word + 2
GLOBAL "pumpa_speed_PID_xout_manual", pumpa_speed_pid_in_start_word + 3
GLOBAL "pumpa_speed_PID_kp", pumpa_speed_pid_in_start_word + 4
GLOBAL "pumpa_speed_PID_ti", pumpa_speed_pid_in_start_word + 5
GLOBAL "pumpa_speed_PID_td", pumpa_speed_pid_in_start_word + 6
GLOBAL "pumpa_speed_PID_scan_time", pumpa_speed_pid_in_start_word + 7
GLOBAL "pumpa_speed_PID_min_out", pumpa_speed_pid_in_start_word + 8
GLOBAL "pumpa_speed_PID_max_out", pumpa_speed_pid_in_start_word + 9
GLOBAL "pumpa_speed_PID_use_i", pumpa_speed_pid_in_start_word + 10
GLOBAL "pumpa_speed_PID_hold_i", pumpa_speed_pid_in_start_word + 11
GLOBAL "pumpa_speed_PID_reset_i_sum", pumpa_speed_pid_in_start_word + 12
GLOBAL "pumpa_speed_PID_igain_reset_val", pumpa_speed_pid_in_start_word + 13
GLOBAL "pumpa_speed_PID_deadb_err", pumpa_speed_pid_in_start_word + 14
GLOBAL "pumpa_speed_PID_ffd", pumpa_speed_pid_in_start_word + 15

CONSTANT "pumpa_speed_PID_Out_start_word", 420
GLOBAL "pumpa_speed_PID_xout", pumpa_speed_pid_out_start_word
GLOBAL "pumpa_speed_PID_er", pumpa_speed_pid_out_start_word + 1
GLOBAL "pumpa_speed_PID_last_p_value", pumpa_speed_pid_out_start_word + 2
GLOBAL "pumpa_speed_PID_last_i_value", pumpa_speed_pid_out_start_word + 3
GLOBAL "pumpa_speed_PID_last_d_value", pumpa_speed_pid_out_start_word + 4
GLOBAL "pumpa_speed_PID_at_high_limit", pumpa_speed_pid_out_start_word + 5
GLOBAL "pumpa_speed_PID_at_low_limit", pumpa_speed_pid_out_start_word + 6
'Note that USER_PID internally 7 - 10 (427-430)
GLOBAL "pumpa_initial_PID_speed", 434

'Pump B PID speed control
CONSTANT "pumpb_speed_PID_in_start_word", 500
GLOBAL "pumpb_speed_PID_auto", pumpb_speed_pid_in_start_word
GLOBAL "pumpb_speed_PID_pv", pumpb_speed_pid_in_start_word + 1
GLOBAL "pumpb_speed_PID_sp", pumpb_speed_pid_in_start_word + 2
GLOBAL "pumpb_speed_PID_xout_manual", pumpb_speed_pid_in_start_word + 3
GLOBAL "pumpb_speed_PID_kp", pumpb_speed_pid_in_start_word + 4
GLOBAL "pumpb_speed_PID_ti", pumpb_speed_pid_in_start_word + 5
GLOBAL "pumpb_speed_PID_td", pumpb_speed_pid_in_start_word + 6
GLOBAL "pumpb_speed_PID_scan_time", pumpb_speed_pid_in_start_word + 7
GLOBAL "pumpb_speed_PID_min_out", pumpb_speed_pid_in_start_word + 8
GLOBAL "pumpb_speed_PID_max_out", pumpb_speed_pid_in_start_word + 9
GLOBAL "pumpb_speed_PID_use_i", pumpb_speed_pid_in_start_word + 10
GLOBAL "pumpb_speed_PID_hold_i", pumpb_speed_pid_in_start_word + 11
GLOBAL "pumpb_speed_PID_reset_i_sum", pumpb_speed_pid_in_start_word + 12
GLOBAL "pumpb_speed_PID_igain_reset_val", pumpb_speed_pid_in_start_word + 13
GLOBAL "pumpb_speed_PID_deadb_err", pumpb_speed_pid_in_start_word + 14
GLOBAL "pumpb_speed_PID_ffd", pumpb_speed_pid_in_start_word + 15

CONSTANT "pumpb_speed_PID_Out_start_word", 520
GLOBAL "pumpb_speed_PID_xout", pumpb_speed_pid_out_start_word
GLOBAL "pumpb_speed_PID_er", pumpb_speed_pid_out_start_word + 1
GLOBAL "pumpb_speed_PID_last_p_value", pumpb_speed_pid_out_start_word + 2
GLOBAL "pumpb_speed_PID_last_i_value", pumpb_speed_pid_out_start_word + 3
GLOBAL "pumpb_speed_PID_last_d_value", pumpb_speed_pid_out_start_word + 4
GLOBAL "pumpb_speed_PID_at_high_limit", pumpb_speed_pid_out_start_word + 5
GLOBAL "pumpb_speed_PID_at_low_limit", pumpb_speed_pid_out_start_word + 6
'Note that USER_PID internally 7 - 10 (527-530)
GLOBAL "pumpb_initial_PID_speed", 534
GLOBAL "pumpb_PID_speed_adjust", 535
GLOBAL "pumpb_actual_ave_ratio", 536
GLOBAL "pumpb_actual_short_ave_ratio", 537
GLOBAL "pumpb_ratio_offset", 538
GLOBAL "recalibrate_pump_gr_per_rpm", 539
GLOBAL "PID_update_time", 540
GLOBAL "Meter_comms_restart", 541
GLOBAL "Product_length", 542
GLOBAL "Product_length_reset", 543
GLOBAL "Safety_Relay_Reset", 544
GLOBAL "Manual_Reset", 545

CONSTANT "EtherCat_State_VR", 546
CONSTANT "EtherCat_Stopped", 0 'Init
CONSTANT "EtherCat_PreOp", 1
CONSTANT "EtherCat_SafeOp", 2
CONSTANT "EtherCat_Op", 3 'Operational

GLOBAL "Meters_Installed", 547
GLOBAL "HMI_Pumps_Run", 548
GLOBAL "HMI_Purge", 549

'Mixer head speed and lube
'NOTE on lube on-time (2026-05-10): the air-pulse luber meters by shot count,
'not pulse width -- once the solenoid has time to open and the shot fires,
'extra on-time does nothing.  MIXER.BAS reads VR 552 (mixer_head_init_lube_
'on_time) as the SINGLE on-time used by all three phases (init, run, prime).
'VRs 555 and 557 are declared for HMI/historical compat but are NOT read by
'MIXER.BAS; the HMI should expose ONE on-time entry bound to VR 552.
GLOBAL "mixer_head_speed_sp", 550
GLOBAL "mixer_head_init_lube_interval", 551
GLOBAL "mixer_head_init_lube_on_time", 552 'unified on-time, used by all phases
GLOBAL "mixer_head_init_lube_count" 553
GLOBAL "mixer_head_run_lube_interval", 554
GLOBAL "mixer_head_run_lube_on_time", 555 'DEPRECATED -- not read by code, use VR 552
'Mixer prime cycle (M-NF-13, added 2026-05-10) -- used by MIXER.BAS when
'mixer_prime_armed is TRUE on the off->on edge of controlbitrun.  Operator-
'tuned via HMI lube screen.  Persistence follows the existing init/run lube
'pattern (same as VR 551/553/554 -- bind on HMI as a numeric input).
GLOBAL "mixer_head_prime_lube_interval", 556
GLOBAL "mixer_head_prime_lube_on_time", 557 'DEPRECATED -- not read by code, use VR 552
GLOBAL "mixer_head_prime_lube_count", 558
GLOBAL "mixer_prime_shots_fired", 559 'live counter, drives HMI "X / count"
'Mixer control-word bit positions (mixer_controlword_vr = VR 7)
'  bit 1 = controlbitjogfwd (existing, manual lube jog)
'  bit 4 = run request -- HMI maintained, 1=run/0=stop+soft-abort
'  bit 5 = prime toggle  -- HMI momentary, edge-detected by MIXER.BAS
CONSTANT "mixer_ctrl_bit_run", 4
CONSTANT "mixer_ctrl_bit_prime", 5
'Mixer status-word bit positions (mixer_statusword_vr = VR 15)
CONSTANT "mixer_stat_bit_running", 0 'motor energized
CONSTANT "mixer_stat_bit_initing", 1 'normal init phase active (motor off)
CONSTANT "mixer_stat_bit_priming", 2 'prime cycle active (luber firing, motor off,
                                           'standalone -- does NOT enable the motor)
CONSTANT "mixer_stat_bit_primearm", 3 'DEPRECATED -- prime no longer has an "armed"
                                           'state; the button starts/aborts directly

'Misc VR's
GLOBAL "Ratio_Alarm_Limit", 560
GLOBAL "Secs_Before_Alarm", 561
GLOBAL "PumpA_Flow_Ave_List_Length", 562
GLOBAL "PumpB_Flow_Ave_List_Length" 563
GLOBAL "Pumps_Flow_Ave_List_Length", 564
GLOBAL "Mixer_Reference_Speed", 565
GLOBAL "PumpA_Min_Flow", 566
GLOBAL "PumpA_Max_Flow", 567
GLOBAL "PumpB_Min_Flow", 568
GLOBAL "PumpB_Max_Flow", 569
GLOBAL "Flow_Average_Sample_Rate", 570
GLOBAL "Overhead_Heater_Temp_Zone1" 571
GLOBAL "Overhead_Heater_Temp_Zone2" 572
GLOBAL "Overhead_Heater_Temp_Zone3" 573
GLOBAL "ADISRA_PumpA_MSpeed", 574
GLOBAL "ADISRA_PumpB_MSpeed", 575
GLOBAL "ADISRA_PumpC_MSpeed", 576
GLOBAL "Ave_B_Min_Limit", 577
GLOBAL "Ave_B_Max_Limit", 578
GLOBAL "ADISRA_PumpA_MSpeed_Decimal", 579
GLOBAL "ADISRA_PumpB_MSpeed_Decimal", 580
GLOBAL "ADISRA_PumpC_MSpeed_Decimal", 581

GLOBAL "PumpA_Torque", 582
GLOBAL "PumpA_Max_Torque", 583
GLOBAL "PumpB_Torque", 584
GLOBAL "PumpB_Max_Torque", 585
GLOBAL "PumpC_Torque", 586
GLOBAL "PumpC_Max_Torque", 587
GLOBAL "Show_Clear_Popup", 588 'End-of-shift footage popup: 0=hidden, 1=visible. Driven by HMI_ANIMATION shift_end_popup.
GLOBAL "Popup_Action", 589 'END SHIFT button writes 1; Yes=2, No=3. Cleared by HMI_ANIMATION after handling.

GLOBAL "NipRoll_inch_per_min_Hz", 590

GLOBAL "Kevlar_Heat_Percent", 191
GLOBAL "Kevlar_Heat_OffOn", 192

'6/18/2024; Add flow meters reading via modbus and controlling BD0 with PID to follow poly
'Modbus address in meter are 1 greater than Trio requested address (example: meter 0 = trio 601)
'Modbus constant function code
CONSTANT "Trio_Communications_Slot", -1 'Built-in port
CONSTANT "Trio_Modbus_Port", 502 'Stand port (default, but set anyway)
CONSTANT "PumpA_Meter_IP1", 192
CONSTANT "PumpA_Meter_IP2", 168
CONSTANT "PumpA_Meter_IP3", 0
CONSTANT "PumpA_Meter_IP4", 200

CONSTANT "PumpB_Meter_IP1", 192
CONSTANT "PumpB_Meter_IP2", 168
CONSTANT "PumpB_Meter_IP3", 0
CONSTANT "PumpB_Meter_IP4", 201

CONSTANT "Modbus_Function_Open_Port", 0
CONSTANT "Modbus_Function_Close_Port", 1
CONSTANT "Modbus_Function_Status", 2
CONSTANT "Modbus_Function_Send_Command", 3

CONSTANT "Modbus_Command_Read_Registers", 3
CONSTANT "Modbus_Command_Write_Multiple_Registers", 16
'Meter (source) modbus starting word (7 words)
CONSTANT "Meter_Source_Start_Word", 0 'Fist Modbus word to read from meter into the following Trio VR words
CONSTANT "Meter_Words_To_Read", 7
'Separate read for meter lifetime totalizer.  New meters (swapped 5/12/2025) no
'longer publish the mass total at register 6 -- it moved to register 10, in kg.
'A dedicated 1-word read avoids extending Meter_Words_To_Read (which would
'overwrite the open/read-error VRs at pumpa/b_meter_start_word+7/+8).
CONSTANT "Meter_Total_Source_Start", 10 'Meter reg holding lifetime total (kg)
CONSTANT "Meter_Total_Words_To_Read", 1 'Single register
CONSTANT "PumpA_Meter_Total_VR", 620 'Trio VR to store pump A lifetime total
CONSTANT "PumpB_Meter_Total_VR", 650 'Trio VR to store pump B lifetime total

'Pump A poly flow meter data
CONSTANT "PumpA_Meter_Start_Word", 601 'Must be a constant (versus global) for Modbus command
CONSTANT "PumpA_Meter_Modbus_Handle", 600
GLOBAL "PumpA_Meter_Error", pumpa_meter_start_word
GLOBAL "PumpA_Meter_Mass_Flow_GperSec", pumpa_meter_start_word + 1 '5/12/2025 changed meter and no implied decimal point
GLOBAL "PumpA_Meter_Density", pumpa_meter_start_word + 2 'Implied x.xx decimal
GLOBAL "PumpA_Meter_Temperature", pumpa_meter_start_word + 3 'Implied x.x decimal
GLOBAL "PumpA_Meter_Mass_Flow_GalperHr", pumpa_meter_start_word + 4 'Impllied x.xx decimal (gal/hr)
GLOBAL "PumpA_Meter_Viscosity", pumpa_meter_start_word + 5 'Implied x.xx decimal
GLOBAL "PumpA_Meter_Mass_Total", 620 'New meter: reg 10 (kg) read separately into VR 620; was pumpa_meter_start_word+6
GLOBAL "PumpA_Meter_Modbus_Open_Error", pumpa_meter_start_word + 7 '0 = not error, 1 = error
GLOBAL "PumpA_Meter_Modbus_Read_Error", pumpa_meter_start_word + 8

'Mass flow is small value (grams/sec) and value varies a bit, so average
GLOBAL "PumpA_Flow_Ave", pumpa_meter_start_word + 9
GLOBAL "PumpA_Calibrated_grPerSecPerRPM",pumpa_meter_start_word + 10
GLOBAL "PumpA_Calibrated_galPerHrPerRPM",pumpa_meter_start_word + 11
GLOBAL "PumpA_Flow_Short_Ave",pumpa_meter_start_word + 12
GLOBAL "PumpA_Meter_Error_Count", pumpa_meter_start_word + 13
CONSTANT "PumpA_Flow_Ave_Start_Word", 1001
'CONSTANT "PumpA_Flow_Ave_List_Length", 30
CONSTANT "PumpA_Flow_Short_Ave_Start_Word", 1040
CONSTANT "pumpa_flow_short_ave_list_len", 4

CONSTANT "PumpB_Meter_Start_Word", 631 'Must be a constant (versus global) for Modbus command
CONSTANT "PumpB_Meter_Modbus_Handle", 630
GLOBAL "PumpB_Meter_Error", pumpb_meter_start_word
GLOBAL "PumpB_Meter_Mass_Flow_GperSec", pumpb_meter_start_word + 1 'Implied x.xx decimal (grams/sec)
GLOBAL "PumpB_Meter_Density", pumpb_meter_start_word + 2 'Implied x.xx decimal
GLOBAL "PumpB_Meter_Temperature", pumpb_meter_start_word + 3 'Implied x.x decimal
GLOBAL "PumpB_Meter_Mass_Flow_GalperHr", pumpb_meter_start_word + 4 'Impllied x.xx decimal (gal/hr)
GLOBAL "PumpB_Meter_Viscosity", pumpb_meter_start_word + 5 'Implied x.xx decimal
GLOBAL "PumpB_Meter_Mass_Total", 650 'New meter: reg 10 (kg) read separately into VR 650; was pumpb_meter_start_word+6
GLOBAL "PumpA_Soft_Total_X100", 660 'Shift-scoped soft totalizer accumulator (implied x100 scale, cleared by Shift_Start_Reset)
GLOBAL "PumpB_Soft_Total_X100", 661
GLOBAL "PumpA_Soft_Total_G", 662 'Integer grams, computed each SHARE_DATA tick from x100 accumulator
GLOBAL "PumpB_Soft_Total_G", 663
'Phase 3 (Outage Recovery / Material) — promote SHARE_DATA's internal accumulators
'from process-locals to true GLOBALs so they survive Proc_Share_Data restart
'and the SHARE block at 4026/4027/4029 stays coherent with what was being summed.
'See Docs/improvements/Outage_Recovery_and_Shift_Anchors.md §7.1 and
'Docs/improvements/Material_Reporting_Restoration_Plan.md §6.3.
GLOBAL "Startup_Material_G_X100", 664 'SHARE_DATA accumulator (implied x100); cleared by Shift_Start_Reset listener
GLOBAL "Startup_Active_S", 665 'SHARE_DATA seconds counter for startup state; cleared by Shift_Start_Reset listener
GLOBAL "Last_Anchor_Length", 666 'Most-recent product_length at shift anchor (feet); published *100 at VR 4029 by SHARE_DATA
GLOBAL "PumpB_Meter_Modbus_Open_Error", pumpb_meter_start_word + 7 '0 = not error, 1 = error
GLOBAL "PumpB_Meter_Modbus_Read_Error", pumpb_meter_start_word + 8

'Mass flow is small value (grams/sec) and value varies a bit, so average
GLOBAL "PumpB_Flow_Ave", pumpb_meter_start_word + 9
GLOBAL "PumpB_Calibrated_grPerSecPerRPM",pumpb_meter_start_word + 10
GLOBAL "PumpB_Calibrated_galPerHrPerRPM",pumpb_meter_start_word + 11
GLOBAL "PumpB_Flow_Short_Ave", pumpb_meter_start_word + 12
GLOBAL "PumpB_Meter_Error_Count", pumpb_meter_start_word + 13
CONSTANT "PumpB_Flow_Ave_Start_Word", 1051
'CONSTANT "PumpB_Flow_Ave_List_Length", 30
CONSTANT "PumpB_Flow_Short_Ave_Start_Word", 1090
CONSTANT "pumpb_flow_short_ave_list_len", 4

GLOBAL "Kicker_Pump_Speed_SetPoint", 700
GLOBAL "Use_Flow_Meters", 701
GLOBAL "Material_Start_Pos_Buff", 702
GLOBAL "Material_End_Pos_Buff", 703
GLOBAL "Material_Width_Buff", 704

'OVERHEAD ZONE 1 PID HEAT CONTROL WORDS
CONSTANT "OVERHEAD_ZONE1_PID_IN_start_wd", 1100
GLOBAL "OVERHEAD_ZONE1_auto", overhead_zone1_pid_in_start_wd
GLOBAL "OVERHEAD_ZONE1_pv", overhead_zone1_pid_in_start_wd + 1
GLOBAL "OVERHEAD_ZONE1_sp", overhead_zone1_pid_in_start_wd + 2
GLOBAL "OVERHEAD_ZONE1_xout_manual", overhead_zone1_pid_in_start_wd + 3
GLOBAL "OVERHEAD_ZONE1_kp", overhead_zone1_pid_in_start_wd + 4
GLOBAL "OVERHEAD_ZONE1_ti", overhead_zone1_pid_in_start_wd + 5
GLOBAL "OVERHEAD_ZONE1_td", overhead_zone1_pid_in_start_wd + 6
GLOBAL "OVERHEAD_ZONE1_scan_time", overhead_zone1_pid_in_start_wd + 7
GLOBAL "OVERHEAD_ZONE1_min_out", overhead_zone1_pid_in_start_wd + 8
GLOBAL "OVERHEAD_ZONE1_max_out", overhead_zone1_pid_in_start_wd + 9
GLOBAL "OVERHEAD_ZONE1_use_i", overhead_zone1_pid_in_start_wd + 10
GLOBAL "OVERHEAD_ZONE1_hold_i", overhead_zone1_pid_in_start_wd + 11
GLOBAL "OVERHEAD_ZONE1_reset_i_sum", overhead_zone1_pid_in_start_wd + 12
GLOBAL "OVERHEAD_ZONE1_igain_reset_val", overhead_zone1_pid_in_start_wd + 13
GLOBAL "OVERHEAD_ZONE1_deadb_err", overhead_zone1_pid_in_start_wd + 14
GLOBAL "OVERHEAD_ZONE1_ffd", overhead_zone1_pid_in_start_wd + 15

CONSTANT "OVERHEAD_ZONE1_PID_OUT_start_wd", 1120
GLOBAL "OVERHEAD_ZONE1_xout", overhead_zone3_pid_out_start_wd
GLOBAL "OVERHEAD_ZONE1_error", overhead_zone3_pid_out_start_wd + 1
GLOBAL "OVERHEAD_ZONE1_last_p_value", overhead_zone3_pid_out_start_wd + 2
GLOBAL "OVERHEAD_ZONE1_last_i_value", overhead_zone3_pid_out_start_wd + 3
GLOBAL "OVERHEAD_ZONE1_last_d_value", overhead_zone3_pid_out_start_wd + 4
GLOBAL "OVERHEAD_ZONE1_at_high_limit", overhead_zone3_pid_out_start_wd + 5
GLOBAL "OVERHEAD_ZONE1_at_low_limit", overhead_zone3_pid_out_start_wd + 6

CONSTANT "OVERHEAD_ZONE1_OFFON_start_wd", 1140
GLOBAL "OVERHEAD_ZONE1_OFFON_PV", overhead_zone1_offon_start_wd
GLOBAL "OVERHEAD_ZONE1_OFFON_SP", overhead_zone1_offon_start_wd + 1
GLOBAL "OVERHEAD_ZONE1_UPPER_DB", overhead_zone1_offon_start_wd + 2
GLOBAL "OVERHEAD_ZONE1_LOWER_DB", overhead_zone1_offon_start_wd + 3
GLOBAL "OVERHEAD_ZONE1_UPDATE_TIME", overhead_zone1_offon_start_wd + 4
GLOBAL "OVERHEAD_ZONE1_ON", overhead_zone1_offon_start_wd + 5
GLOBAL "OVERHEAD_ZONE1_timer", overhead_zone1_offon_start_wd + 6
GLOBAL "OVERHEAD_ZONE1_override", overhead_zone1_offon_start_wd + 7
CONSTANT "OVERHEAD_ZONE1_DV_OUT", 0

'OVERHEAD ZONE 2 HOSE PID HEAT CONTROL WORDS
CONSTANT "OVERHEAD_ZONE2_PID_IN_start_wd", 1200
GLOBAL "OVERHEAD_ZONE2_auto", overhead_zone2_pid_in_start_wd
GLOBAL "OVERHEAD_ZONE2_pv", overhead_zone2_pid_in_start_wd + 1
GLOBAL "OVERHEAD_ZONE2_sp", overhead_zone2_pid_in_start_wd + 2
GLOBAL "OVERHEAD_ZONE2_xin_manual", overhead_zone2_pid_in_start_wd + 3
GLOBAL "OVERHEAD_ZONE2_kp", overhead_zone2_pid_in_start_wd + 4
GLOBAL "OVERHEAD_ZONE2_ti", overhead_zone2_pid_in_start_wd + 5
GLOBAL "OVERHEAD_ZONE2_td", overhead_zone2_pid_in_start_wd + 6
GLOBAL "OVERHEAD_ZONE2_scan_time", overhead_zone2_pid_in_start_wd + 7
GLOBAL "OVERHEAD_ZONE2_min_in", overhead_zone2_pid_in_start_wd + 8
GLOBAL "OVERHEAD_ZONE2_max_in", overhead_zone2_pid_in_start_wd + 9
GLOBAL "OVERHEAD_ZONE2_use_i", overhead_zone2_pid_in_start_wd + 10
GLOBAL "OVERHEAD_ZONE2_hold_i", overhead_zone2_pid_in_start_wd + 11
GLOBAL "OVERHEAD_ZONE2_reset_i_sum", overhead_zone2_pid_in_start_wd + 12
GLOBAL "OVERHEAD_ZONE2_igain_reset_val", overhead_zone2_pid_in_start_wd + 13
GLOBAL "OVERHEAD_ZONE2_deadb_err", overhead_zone2_pid_in_start_wd + 14
GLOBAL "OVERHEAD_ZONE2_ffd", overhead_zone2_pid_in_start_wd + 15

CONSTANT "overhead_zone2_pid_out_start_wd", 1220
GLOBAL "OVERHEAD_ZONE2_xout", overhead_zone2_pid_out_start_wd
GLOBAL "OVERHEAD_ZONE2_error", overhead_zone2_pid_out_start_wd + 1
GLOBAL "OVERHEAD_ZONE2_last_p_value", overhead_zone2_pid_out_start_wd + 2
GLOBAL "OVERHEAD_ZONE2_last_i_value", overhead_zone2_pid_out_start_wd + 3
GLOBAL "OVERHEAD_ZONE2_last_d_value", overhead_zone2_pid_out_start_wd + 4
GLOBAL "OVERHEAD_ZONE2_at_high_limit", overhead_zone2_pid_out_start_wd + 5
GLOBAL "OVERHEAD_ZONE2_at_low_limit", overhead_zone2_pid_out_start_wd + 6

CONSTANT "OVERHEAD_ZONE2_OFFON_start_wd", 1240
GLOBAL "OVERHEAD_ZONE2_OFFON_PV", overhead_zone2_offon_start_wd
GLOBAL "OVERHEAD_ZONE2_OFFON_SP", overhead_zone2_offon_start_wd + 1
GLOBAL "OVERHEAD_ZONE2_UPPER_DB", overhead_zone2_offon_start_wd + 2
GLOBAL "OVERHEAD_ZONE2_LOWER_DB", overhead_zone2_offon_start_wd + 3
GLOBAL "OVERHEAD_ZONE2_UPDATE_TIME", overhead_zone2_offon_start_wd + 4
GLOBAL "OVERHEAD_ZONE2_ON", overhead_zone2_offon_start_wd + 5
GLOBAL "OVERHEAD_ZONE2_TIMER", overhead_zone2_offon_start_wd + 6
GLOBAL "OVERHEAD_ZONE2_OVERRIDE", overhead_zone2_offon_start_wd + 7
CONSTANT "OVERHEAD_ZONE2_DV_OUT", 1

'OVERHEAD ZONE 2 PID HEAT CONTROL WORDS
CONSTANT "OVERHEAD_ZONE3_PID_IN_start_wd", 1300
GLOBAL "OVERHEAD_ZONE3_auto", overhead_zone3_pid_in_start_wd
GLOBAL "OVERHEAD_ZONE3_pv", overhead_zone3_pid_in_start_wd + 1
GLOBAL "OVERHEAD_ZONE3_sp", overhead_zone3_pid_in_start_wd + 2
GLOBAL "OVERHEAD_ZONE3_xin_manual", overhead_zone3_pid_in_start_wd + 3
GLOBAL "OVERHEAD_ZONE3_kp", overhead_zone3_pid_in_start_wd + 4
GLOBAL "OVERHEAD_ZONE3_ti", overhead_zone3_pid_in_start_wd + 5
GLOBAL "OVERHEAD_ZONE3_td", overhead_zone3_pid_in_start_wd + 6
GLOBAL "OVERHEAD_ZONE3_scan_time", overhead_zone3_pid_in_start_wd + 7
GLOBAL "OVERHEAD_ZONE3_min_in", overhead_zone3_pid_in_start_wd + 8
GLOBAL "OVERHEAD_ZONE3_max_in", overhead_zone3_pid_in_start_wd + 9
GLOBAL "OVERHEAD_ZONE3_use_i", overhead_zone3_pid_in_start_wd + 10
GLOBAL "OVERHEAD_ZONE3_hold_i", overhead_zone3_pid_in_start_wd + 11
GLOBAL "OVERHEAD_ZONE3_reset_i_sum", overhead_zone3_pid_in_start_wd + 12
GLOBAL "OVERHEAD_ZONE3_igain_reset_val", overhead_zone3_pid_in_start_wd + 13
GLOBAL "OVERHEAD_ZONE3_deadb_err", overhead_zone3_pid_in_start_wd + 14
GLOBAL "OVERHEAD_ZONE3_ffd", overhead_zone3_pid_in_start_wd + 15

CONSTANT "OVERHEAD_ZONE3_PID_OUT_start_wd", 1320
GLOBAL "OVERHEAD_ZONE3_xout", overhead_zone3_pid_out_start_wd
GLOBAL "OVERHEAD_ZONE3_error", overhead_zone3_pid_out_start_wd + 1
GLOBAL "OVERHEAD_ZONE3_last_p_value", overhead_zone3_pid_out_start_wd + 2
GLOBAL "OVERHEAD_ZONE3_last_i_value", overhead_zone3_pid_out_start_wd + 3
GLOBAL "OVERHEAD_ZONE3_last_d_value", overhead_zone3_pid_out_start_wd + 4
GLOBAL "OVERHEAD_ZONE3_at_high_limit", overhead_zone3_pid_out_start_wd + 5
GLOBAL "OVERHEAD_ZONE3_at_low_limit", overhead_zone3_pid_out_start_wd + 6

CONSTANT "OVERHEAD_ZONE3_OFFON_start_wd", 1340
GLOBAL "OVERHEAD_ZONE3_OFFON_PV", overhead_zone3_offon_start_wd
GLOBAL "OVERHEAD_ZONE3_OFFON_SP", overhead_zone3_offon_start_wd + 1
GLOBAL "OVERHEAD_ZONE3_UPPER_DB", overhead_zone3_offon_start_wd + 2
GLOBAL "OVERHEAD_ZONE3_LOWER_DB", overhead_zone3_offon_start_wd + 3
GLOBAL "OVERHEAD_ZONE3_UPDATE_TIME", overhead_zone3_offon_start_wd + 4
GLOBAL "OVERHEAD_ZONE3_ON", overhead_zone3_offon_start_wd + 5
GLOBAL "OVERHEAD_ZONE3_TIMER", overhead_zone3_offon_start_wd + 6
GLOBAL "OVERHEAD_ZONE3_OVERRIDE", overhead_zone3_offon_start_wd + 7
CONSTANT "OVERHEAD_ZONE3_DV_OUT", 2

'MIXER DELTA-P PID AND OFF/ON HEAT CONTROL WORDS
CONSTANT "MIXER_deltapa_PID_IN_start_wd", 1700
GLOBAL "MIXER_deltapa_auto", mixer_deltapa_pid_in_start_wd
GLOBAL "MIXER_deltapa_pv", mixer_deltapa_pid_in_start_wd + 1
GLOBAL "MIXER_deltapa_sp", mixer_deltapa_pid_in_start_wd + 2
GLOBAL "MIXER_deltapa_xout_manual", mixer_deltapa_pid_in_start_wd + 3
GLOBAL "MIXER_deltapa_kp", mixer_deltapa_pid_in_start_wd + 4
GLOBAL "MIXER_deltapa_ti", mixer_deltapa_pid_in_start_wd + 5
GLOBAL "MIXER_deltapa_td", mixer_deltapa_pid_in_start_wd + 6
GLOBAL "MIXER_deltapa_scan_time", mixer_deltapa_pid_in_start_wd + 7
GLOBAL "MIXER_deltapa_min_out", mixer_deltapa_pid_in_start_wd + 8
GLOBAL "MIXER_deltapa_max_out", mixer_deltapa_pid_in_start_wd + 9
GLOBAL "MIXER_deltapa_use_i", mixer_deltapa_pid_in_start_wd + 10
GLOBAL "MIXER_deltapa_hold_i", mixer_deltapa_pid_in_start_wd + 11
GLOBAL "MIXER_deltapa_reset_i_sum", mixer_deltapa_pid_in_start_wd + 12
GLOBAL "MIXER_deltapa_igain_reset_val", mixer_deltapa_pid_in_start_wd + 13
GLOBAL "MIXER_deltapa_deadb_err", mixer_deltapa_pid_in_start_wd + 14
GLOBAL "MIXER_deltapa_ffd", mixer_deltapa_pid_in_start_wd + 15

CONSTANT "MIXER_deltapa_PID_OUT_start_wd", 1720
GLOBAL "MIXER_deltapa_xout", mixer_deltapa_pid_out_start_wd
GLOBAL "MIXER_deltapa_error", mixer_deltapa_pid_out_start_wd + 1
GLOBAL "MIXER_deltapa_last_p_value", mixer_deltapa_pid_out_start_wd + 2
GLOBAL "MIXER_deltapa_last_i_value", mixer_deltapa_pid_out_start_wd + 3
GLOBAL "MIXER_deltapa_last_d_value", mixer_deltapa_pid_out_start_wd + 4
GLOBAL "MIXER_deltapa_at_high_limit", mixer_deltapa_pid_out_start_wd + 5
GLOBAL "MIXER_deltapa_at_low_limit", mixer_deltapa_pid_out_start_wd + 6

CONSTANT "MIXER_deltapa_OFFON_start_wd", 1740
GLOBAL "MIXER_deltapa_OFFON_PV", mixer_deltapa_offon_start_wd
GLOBAL "MIXER_deltapa_OFFON_SP", mixer_deltapa_offon_start_wd + 1
GLOBAL "MIXER_deltapa_UPPER_DB", mixer_deltapa_offon_start_wd + 2
GLOBAL "MIXER_deltapa_LOWER_DB", mixer_deltapa_offon_start_wd + 3
GLOBAL "MIXER_deltapa_UPDATE_TIME", mixer_deltapa_offon_start_wd + 4
GLOBAL "MIXER_deltapa_ON", mixer_deltapa_offon_start_wd + 5
GLOBAL "MIXER_deltapa_TIMER", mixer_deltapa_offon_start_wd + 6
GLOBAL "MIXER_deltapa_OVERRIDE", mixer_deltapa_offon_start_wd + 7

CONSTANT "MIXER_deltapb_PID_IN_start_wd", 1800
GLOBAL "MIXER_deltapb_auto", mixer_deltapb_pid_in_start_wd
GLOBAL "MIXER_deltapb_pv", mixer_deltapb_pid_in_start_wd + 1
GLOBAL "MIXER_deltapb_sp", mixer_deltapb_pid_in_start_wd + 2
GLOBAL "MIXER_deltapb_xout_manual", mixer_deltapb_pid_in_start_wd + 3
GLOBAL "MIXER_deltapb_kp", mixer_deltapb_pid_in_start_wd + 4
GLOBAL "MIXER_deltapb_ti", mixer_deltapb_pid_in_start_wd + 5
GLOBAL "MIXER_deltapb_td", mixer_deltapb_pid_in_start_wd + 6
GLOBAL "MIXER_deltapb_scan_time", mixer_deltapb_pid_in_start_wd + 7
GLOBAL "MIXER_deltapb_min_out", mixer_deltapb_pid_in_start_wd + 8
GLOBAL "MIXER_deltapb_max_out", mixer_deltapb_pid_in_start_wd + 9
GLOBAL "MIXER_deltapb_use_i", mixer_deltapb_pid_in_start_wd + 10
GLOBAL "MIXER_deltapb_hold_i", mixer_deltapb_pid_in_start_wd + 11
GLOBAL "MIXER_deltapb_reset_i_sum", mixer_deltapb_pid_in_start_wd + 12
GLOBAL "MIXER_deltapb_igain_reset_val", mixer_deltapb_pid_in_start_wd + 13
GLOBAL "MIXER_deltapb_deadb_err", mixer_deltapb_pid_in_start_wd + 14
GLOBAL "MIXER_deltapb_ffd", mixer_deltapb_pid_in_start_wd + 15

CONSTANT "MIXER_deltapb_PID_OUT_start_wd", 1820
GLOBAL "MIXER_deltapb_xout", mixer_deltapb_pid_out_start_wd
GLOBAL "MIXER_deltapb_error", mixer_deltapb_pid_out_start_wd + 1
GLOBAL "MIXER_deltapb_last_p_value", mixer_deltapb_pid_out_start_wd + 2
GLOBAL "MIXER_deltapb_last_i_value", mixer_deltapb_pid_out_start_wd + 3
GLOBAL "MIXER_deltapb_last_d_value", mixer_deltapb_pid_out_start_wd + 4
GLOBAL "MIXER_deltapb_at_high_limit", mixer_deltapb_pid_out_start_wd + 5
GLOBAL "MIXER_deltapb_at_low_limit", mixer_deltapb_pid_out_start_wd + 6

CONSTANT "MIXER_deltapb_OFFON_start_wd", 1840
GLOBAL "MIXER_deltapb_OFFON_PV", mixer_deltapb_offon_start_wd
GLOBAL "MIXER_deltapb_OFFON_SP", mixer_deltapb_offon_start_wd + 1
GLOBAL "MIXER_deltapb_UPPER_DB", mixer_deltapb_offon_start_wd + 2
GLOBAL "MIXER_deltapb_LOWER_DB", mixer_deltapb_offon_start_wd + 3
GLOBAL "MIXER_deltapb_UPDATE_TIME", mixer_deltapb_offon_start_wd + 4
GLOBAL "MIXER_deltapb_on", mixer_deltapb_offon_start_wd + 5
GLOBAL "MIXER_deltapb_TIMER", mixer_deltapb_offon_start_wd + 6
GLOBAL "MIXER_deltapb_OVERRIDE", mixer_deltapb_offon_start_wd + 7

'MIXER DELTA-P PID AND OFF/ON HEAT CONTROL WORDS
CONSTANT "MIXER_HEAD_PID_IN_start_wd", 1900
GLOBAL "MIXER_HEAD_auto", mixer_head_pid_in_start_wd
GLOBAL "MIXER_HEAD_pv", mixer_head_pid_in_start_wd + 1
GLOBAL "MIXER_HEAD_sp", mixer_head_pid_in_start_wd + 2
GLOBAL "MIXER_HEAD_xout_manual", mixer_head_pid_in_start_wd + 3
GLOBAL "MIXER_HEAD_kp", mixer_head_pid_in_start_wd + 4
GLOBAL "MIXER_HEAD_ti", mixer_head_pid_in_start_wd + 5
GLOBAL "MIXER_HEAD_td", mixer_head_pid_in_start_wd + 6
GLOBAL "MIXER_HEAD_scan_time", mixer_head_pid_in_start_wd + 7
GLOBAL "MIXER_HEAD_min_out", mixer_head_pid_in_start_wd + 8
GLOBAL "MIXER_HEAD_max_out", mixer_head_pid_in_start_wd + 9
GLOBAL "MIXER_HEAD_use_i", mixer_head_pid_in_start_wd + 10
GLOBAL "MIXER_HEAD_hold_i", mixer_head_pid_in_start_wd + 11
GLOBAL "MIXER_HEAD_reset_i_sum", mixer_head_pid_in_start_wd + 12
GLOBAL "MIXER_HEAD_igain_reset_val", mixer_head_pid_in_start_wd + 13
GLOBAL "MIXER_HEAD_deadb_err", mixer_head_pid_in_start_wd + 14
GLOBAL "MIXER_HEAD_ffd", mixer_head_pid_in_start_wd + 15

CONSTANT "MIXERHEAD_PID_OUT_start_wd", 1920
GLOBAL "MIXER_HEAD_xout", bdo_cart_pid_out_start_wd
GLOBAL "MIXER_HEAD_error", bdo_cart_pid_out_start_wd + 1
GLOBAL "MIXER_HEAD_last_p_value", bdo_cart_pid_out_start_wd + 2
GLOBAL "MIXER_HEAD_last_i_value", bdo_cart_pid_out_start_wd + 3
GLOBAL "MIXER_HEAD_last_d_value", bdo_cart_pid_out_start_wd + 4
GLOBAL "MIXER_HEAD_at_high_limit", bdo_cart_pid_out_start_wd + 5
GLOBAL "MIXER_HEAD_at_low_limit", bdo_cart_pid_out_start_wd + 6

CONSTANT "MIXER_HEAD_OFFON_start_wd", 1940
GLOBAL "MIXER_HEAD_OFFON_PV", mixer_head_offon_start_wd
GLOBAL "MIXER_HEAD_OFFON_SP", mixer_head_offon_start_wd + 1
GLOBAL "MIXER_HEAD_UPPER_DB", mixer_head_offon_start_wd + 2
GLOBAL "MIXER_HEAD_LOWER_DB", mixer_head_offon_start_wd + 3
GLOBAL "MIXER_HEAD_UPDATE_TIME", mixer_head_offon_start_wd + 4
GLOBAL "MIXER_HEAD_ON", mixer_head_offon_start_wd + 5
GLOBAL "MIXER_HEAD_TIMER", mixer_head_offon_start_wd + 6
GLOBAL "MIXER_HEAD_OVERRIDE", mixer_head_offon_start_wd + 7

'Mixer module temperatures
CONSTANT "Mixer_DeltaP_A_Start_Word", 2001 'Must be a constant (versus global) for Modbus command
CONSTANT "Mixer_DeltaP_A_Modbus_Handle", 2000
GLOBAL "Mixer_DeltaP_A_Temp", mixer_deltap_a_start_word
GLOBAL "Mixer_DeltaP_B_Temp", mixer_deltap_a_start_word + 1 'Implied x.xx decimal (grams/sec)
GLOBAL "Mixer_Head_Temp", mixer_deltap_a_start_word + 2 'Implied x.xx decimal
GLOBAL "Mixer_Head_Open_Error", mixer_deltap_a_start_word + 3
GLOBAL "Mixer_Head_Read_Error", mixer_deltap_a_start_word + 4

'Temperature off/on control timing
GLOBAL "Heat_On_Time", 2101
GLOBAL "Heat_Off_Time", 2102

'ADISRA data via Modbus driver
'Some floating point data sent with integer in one Modbus address and decimal portion sent as integer in
'another address with implied decimal places sent to ADISRA where divided by the implied decimal places.
'Flow meter data is implied 2 decimal places and will not exceed Modbus value limit of 32565 (325.65), so actual value
'sent

'Ratio implied 4 decimal places .0001, so number would be too large to send without implied decimal
GLOBAL "ADISRA_Mix_Ratio_SP_Int", 2201 'Whole number
GLOBAL "ADISRA_Mix_Ration_SP_Dec", 2202 'Decimal portion (integer * 10000; implied decimal places in ADISRA)
GLOBAL "ADISRA_Mix_Ratio_Actual_Int", 2203 'Whole number
GLOBAL "ADISRA_Mix_Ration_Actual_Dec", 2204 'Decimal portion (integer * 10000; implied decimal places in ADISRA)
GLOBAL "ADISRA_Record_Flow", 2205
GLOBAL "ADISRA_Record_Speed", 2206
GLOBAL "ADISRA_Record_Temp", 2207

'Production uptime accumulator — incremented in NIP_ROLL while producing,
'split into 16-bit LO/HI words by SHARE_DATA for Modbus dashboard reads
GLOBAL "Production_Seconds", 2208

'Dashboard SHARE_DATA block — staged every 500 ms by SHARE_DATA.BAS for an
'external Modbus TCP poller (e.g. Grafana KPI board).  See
'Docs/Modbus_TCP_Integration.md "Dashboard SHARE_DATA Block" for full layout
'and the HI-first / poller double-read protocol used to dodge torn 32-bit reads.
CONSTANT "Share_Data_Period_ms", 2000
GLOBAL "Share_Line_State", 4000 'Bit0=nip running, 1=traverse mov, 2=PumpA mov, 3=PumpB mov, 4=auto
GLOBAL "Share_System_Running", 4001 'Three-way AND: nip + traverse + PumpA all moving
GLOBAL "Share_Length_Lo", 4002 '(Product_length * 100) low 16 bits
GLOBAL "Share_Length_Hi", 4003 '(Product_length * 100) high 16 bits
GLOBAL "Share_Nip_Speed_x10", 4004 'in/min * 10
GLOBAL "Share_Traverse_Speed_x10", 4005
GLOBAL "Share_PumpA_RPM_x10", 4006
GLOBAL "Share_PumpB_RPM_x10", 4007
GLOBAL "Share_PumpA_Flow", 4008 'Passthrough of VR 602, implied 2 decimals (g/sec)
GLOBAL "Share_PumpB_Flow", 4009 'Passthrough of VR 632
GLOBAL "Share_Ratio_Actual_x10000", 4010
GLOBAL "Share_Ratio_SP_x10000", 4011
GLOBAL "Share_PumpA_Total_Lo", 4012 'Mass total low word (from VR 607)
GLOBAL "Share_PumpA_Total_Hi", 4013
GLOBAL "Share_PumpB_Total_Lo", 4014
GLOBAL "Share_PumpB_Total_Hi", 4015
GLOBAL "Share_Recipe", 4016
GLOBAL "Share_SystemStatus", 4017 'Mirror of VR 24 (E-Stop / EtherCAT bitfield — see Modbus_TCP_Integration.md)
GLOBAL "Share_PumpA_Errors", 4018 'Mirror of VR 613 (meter comm error count)
GLOBAL "Share_PumpB_Errors", 4019 'Mirror of VR 643
GLOBAL "Share_Heartbeat", 4020 'Increments each tick; poller flags Trio stale if frozen
GLOBAL "Share_Uptime_Lo", 4021 'Production_Seconds low 16 bits
GLOBAL "Share_Uptime_Hi", 4022
GLOBAL "Share_Nip_FtPerMin_x10", 4023 'Linear belt rate, ft/min * 10 (matches Line 1 slot 4023)
GLOBAL "Operator_Shift_Done", 4024 'Set to 1 by "End Shift" HMI button; cleared by length reset. Poller gates uptime/system_running when set.
GLOBAL "Shift_Active_Display", 4025 'Inverse of VR 4024: 1=shift active, 0=shift done. Maintained by SHARE_DATA every 2s. Used by HMI Visible binding on ButtonShiftActive.

'Dashboard SHARE block extension — Material Reporting Restoration Phase 3
'(VR 4026/4027) and Outage Recovery Phase 3 (VR 4028/4029).  VR 4026/4027
'are read-only published by SHARE_DATA every 2 s.  VR 4028 is
'server-writable: poller sets 1 on active_shift transition; SHARE_DATA's
'listener clears product_length + startup accumulators atomically and
'ack-zeros the VR.  VR 4029 publishes the most-recent anchor x100 so the
'server can verify the reset cycle.  See
'Docs/improvements/Material_Reporting_Restoration_Plan.md §6.3 and
'Docs/improvements/Outage_Recovery_and_Shift_Anchors.md §7.1.
GLOBAL "Share_Startup_Material_G", 4026 'A+B grams accumulated this shift while in startup (pumps moving + traverse/nip idle)
GLOBAL "Share_Startup_Active_S", 4027 'Seconds spent in startup this shift; companion to 4026
GLOBAL "Shift_Start_Reset", 4028 'Poller writes 1 on shift transition; SHARE_DATA acks by writing 0
GLOBAL "Share_Last_Anchor_X100", 4029 'Trio publishes last_anchor_length * 100 so server can verify reset cycle

'Dashboard RECEIVE block — written FROM the KPI poller (Modbus FC16)
'and READ by the Trio HMI SCHEDULE.TGD page.  Five scheduled runs at
'five VRs each, plus a two-VR header (27 registers total).  See
'HMIFiles/SCHEDULE.TGD and kpi_board/line2/poll.py.
'
'NOTE: the Waste VR for each row is OPERATOR-WRITABLE from the HMI
'(TVBTextBox bound ReadWrite, write_event=LostFocus).  The poller reads
'it back each tick, persists changes to the SQLite waste_entries table,
'then writes it back as part of the next-tick refresh.  Trio code MUST
'NOT write to these VRs.
GLOBAL "Recv_Today_MMDD", 4030 'Today's date as MMDD (e.g., 505 = May 5). Max 1231 fits in 16-bit.
GLOBAL "Recv_Run_Count", 4031 'Number of valid run rows below (0-5)
'Per-row layout, five VRs per row, rows 0-4:
'   +0 SO_last4 (or -1 for stock items; full SO on dashboard title bar)
'   +1 Target ft
'   +2 Done ft (good footage = measured - waste)
'   +3 % complete (0-100, computed from good footage)
'   +4 Waste ft (operator-editable on HMI)
GLOBAL "Recv_Run0_Base", 4032
GLOBAL "Recv_Run1_Base", 4037
GLOBAL "Recv_Run2_Base", 4042
GLOBAL "Recv_Run3_Base", 4047
GLOBAL "Recv_Run4_Base", 4052
'Single-register trailer (VR 4057): minutes since the manager last hit
'Switch-To on the Manager Dashboard (i.e., elapsed time since
'active_run.set_at_ts).  0 when no active run.  Drives the "Active for
'Nh Mm" cross-day hand-off banner on SCHEDULE.TGD -- the operator (or
'next-day manager) sees this if someone forgot to switch / mark-complete
'before going home.  See Docs/HMI_Schedule_Page.md "Cross-day hand-off
'nudge" + Docs/adr/0001-immutable-run-control.md.
GLOBAL "Recv_Active_Run_Minutes", 4057

'End Shift button gate.  Bound to ButtonShiftActive.Visible (OPERATOR_MAIN.TGD)
'instead of VR 4025 (Shift_Active_Display) directly, so the orange END SHIFT
'button is HIDDEN whenever any of nip/traverse/pumpA/pumpB is non-idle —
'preventing an accidental press from latching operator_shift_done mid-run.
'SHARE_DATA recomputes every 2 s as:
'   end_shift_button_visible = shift_active_display * (no axis motion)
'PumpC is omitted because it ratio-follows PumpA (idle PumpA → idle PumpC).
GLOBAL "End_Shift_Button_Visible", 4058
'*********************** VR(3000) to VR(3039) reserved for thermocouple config words.
'*********************** VR(3000) first t/c module, VR(3010) second t/c module,'VR(3020) RTD module, VR(3030) third t/
'c module

'These are nip roll drive EtherCat status and control words mapped to VR directly from EtherCAT per EC_EXTEND address
'==== Status word and bits
GLOBAL "Nip_Roll_Status_Start_Word", 5000
GLOBAL "Nip_Roll_Status_Word", nip_roll_status_start_word
CONSTANT "Nip_Roll_Status_Running_Bit", 0
CONSTANT "Nip_Roll_Status_Fault_Bit", 1
CONSTANT "Nip_Roll_Status_Manual_Bit", 2
CONSTANT "Nip_Roll_Status_Inhibit_Bit", 3
CONSTANT "Nip_Roll_Status_Maint_Bit", 4
'===== Speed reference word
GLOBAL "Nip_Roll_Stat_Speed_Word", nip_roll_status_start_word + 1
'====  Control word and bits
CONSTANT "Nip_Roll_Control_Start_Word", 5010
GLOBAL "Nip_Roll_Control_Word", nip_roll_control_start_word
CONSTANT "Nip_Roll_Control_Run_Bit", 0
CONSTANT "Nip_Roll_Control_Fast_Stop_Bit", 1
CONSTANT "Nip_Roll_Cntrl_Fault_Reset_Bit", 2
CONSTANT "Nip_Roll_Control_Coast_Stop_Bit", 3
'==== Speed control word
GLOBAL "Nip_Roll_Speed_Word", nip_roll_control_start_word + 1

RUN "INIT_PARAMETERS", proc_init_parameters
WAIT UNTIL PROC_STATUS PROC(proc_init_parameters) <> 0 'wait for it to start
WAIT UNTIL PROC_STATUS PROC(proc_init_parameters) = 0 'wait for it to finish
