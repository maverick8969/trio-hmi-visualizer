# DemoCell -- controller variable map

Every VR address the HMI reads or writes. HMI writes are operator commands;
the controller program must act on them (and clear one-shot command bits).

| Address | Description | HMI reads | HMI writes |
|---|---|---|---|
| `VR(10)` | Command word (HMI -> controller, one-shot bits) | SETUP/lblCmdWord.Text | - |
| `VR(10).0` | START | - | MAIN/btnStart Click |
| `VR(10).1` | STOP | - | MAIN/btnStop Click |
| `VR(10).2` | RESET | - | MAIN/btnReset Click |
| `VR(11)` | Status word (controller -> HMI) | SETUP/lblStatWord.Text | - |
| `VR(11).0` | RUNNING | JOG/lmpJogBlocked.Status<br>MAIN/lmpRun.Status | - |
| `VR(11).1` | FAULT | MAIN/almFault.Visible<br>MAIN/lmpFault.Status | - |
| `VR(11).2` | HOMED | JOG/lmpJogHomed.Status<br>MAIN/lmpHomed.Status | - |
| `VR(12).0` | JOG+ | JOG/btnJogPos_lamp.Status | JOG/btnJogPos ButtonDown<br>JOG/btnJogPos ButtonUp |
| `VR(12).1` | JOG- | JOG/btnJogNeg_lamp.Status | JOG/btnJogNeg ButtonDown<br>JOG/btnJogNeg ButtonUp |
| `VR(12).2` | HOME | - | JOG/btnHome Click |
| `VR(20).0` | Vacuum | MAIN/tglVacuum_lamp.Status | MAIN/tglVacuum Click |
| `VR(20).1` | Coolant | MAIN/tglCoolant_lamp.Status | MAIN/tglCoolant Click |
| `VR(20).2` | Auto-restart | SETUP/chkAuto.Checked | SETUP/chkAuto.Checked (operator entry) |
| `VR(50).0` | Drive fault | SETUP/lmpDiagFault.Status | SETUP/btnFault Click |
| `VR(100)` | Speed setpoint (mm/s) | MAIN/txtSpeed.Text | MAIN/txtSpeed.Text (operator entry) |
| `VR(101)` | Actual speed (mm/s) | MAIN/lblActual.Text | - |
| `VR(102)` | Axis 0 position (mm) | JOG/lblJogPos.Text<br>MAIN/lblPos.Text | - |
| `VR(103)` | Jog speed (mm/s) | JOG/txtJogSpeed.Text | JOG/txtJogSpeed.Text (operator entry) |
| `VR(104)` | Part count | MAIN/lblCount.Text | - |
| `VR(105)` | Batch size | MAIN/txtBatch.Text<br>SETUP/stpBatch.Text | MAIN/txtBatch.Text (operator entry)<br>SETUP/stpBatch.Text (operator entry)<br>SETUP/stpBatch_dec Click<br>SETUP/stpBatch_inc Click |
| `VR(106)` | Dwell time (ms) | SETUP/txtDwell.Text | SETUP/txtDwell.Text (operator entry) |
