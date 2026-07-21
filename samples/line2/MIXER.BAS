'For mixer heat control see program HEATER_OFFON_CONTROL
'
'======================================================================
' MIXER motor + lube state machine (Proc 10)
'
' INPUTS
'   mixer_controlword_vr bit mixer_ctrl_bit_run     - operator run request
'                                                     (maintained, 1=run, 0=stop)
'   mixer_controlword_vr bit mixer_ctrl_bit_prime   - prime button (momentary,
'                                                     edge-detected; toggles
'                                                     mixer_prime_running)
'   mixer_controlword_vr.controlbitjogfwd           - manual lube jog (manual mode)
'   triocontrolword_vr.automode                     - 1=Auto, 0=Manual
'   MTYPE AXIS(axis_pump_a), lube_with_pumps        - legacy pump-A trigger
'                                                     (lube_with_pumps is currently
'                                                     never assigned -> effectively
'                                                     constant 0; path is dormant
'                                                     but preserved for future use)
'   mixer_head_init_lube_on_time (VR 552)           - UNIFIED pulse width, used by
'                                                     all phases incl. prime (the
'                                                     air-pulse luber meters by shot
'                                                     count, not pulse width).  VRs
'                                                     555 and 557 are declared but
'                                                     not read.
'   mixer_head_init_lube_count (VR 553)             - normal startup shot count
'   mixer_head_init_lube_interval (VR 551)          - normal startup interval
'   mixer_head_prime_lube_count (VR 558)            - prime shot count
'   mixer_head_prime_lube_interval (VR 556)         - prime interval between shots
'   mixer_head_run_lube_interval (VR 554)           - run-phase interval
'
' OUTPUTS
'   OP(out_mixer_lube)                              - lube solenoid
'   OP(out_mixerrun)                                - mixer motor relay
'   AOUT(6)                                         - mixer VFD speed reference
'   mixer_statusword_vr bit mixer_stat_bit_running  - motor energized
'   mixer_statusword_vr bit mixer_stat_bit_initing  - init phase active
'   mixer_statusword_vr bit mixer_stat_bit_priming  - prime cycle active (luber
'                                                     firing, motor NOT enabled)
'   VR mixer_prime_shots_fired                      - live shot counter (HMI X/count)
'
' STATE MACHINE
'
' The mixer has TWO independent state machines that share the lube solenoid:
'
'   A) NORMAL LUBE CYCLE (Auto mode only)
'      Drives the mixer motor.  Off->on edge of run_requested triggers an
'      initial-lube phase (motor held off, fires mixer_head_init_lube_count
'      shots), then enables the motor and runs the run-phase lube cadence.
'      Soft abort: clearing controlbitrun mid-cycle resets everything and
'      keeps the motor off.
'
'      1. Idle:               solenoid OFF, motor OFF.
'      2. Off->on kickstart:  first scan that detects run_requested = TRUE on
'                             a rising edge.  Zeros shot counter, holds motor
'                             OFF, sets TICKS=0 so the first init pulse fires
'                             on the next mixer_lube call.  If init count < 1,
'                             skips the init phase entirely.
'      3. Init phase:         fires <count> shots while motor held OFF.
'      4. End of init:        motor ON, switch to run-phase cadence.
'      5. Run phase:          periodic lube pulses while motor runs.
'      6. Soft abort:         when run_requested goes FALSE mid-cycle (any
'                             phase), close solenoid, force motor OFF, reset
'                             state.  Cycle restartable by setting
'                             controlbitrun = 1.
'
'   B) PRIME CYCLE (works in Auto or Manual mode)
'      Standalone maintenance action -- fires shots into an empty/dry lube
'      passage to flood it (e.g., when an operator installs a new mixer
'      head).  Does NOT start the mixer motor.  Mixer motor must be OFF and
'      the normal cycle must be idle for prime to start.
'
'      1. Idle:               solenoid OFF, mixer_prime_running = FALSE.
'      2. Operator presses prime button -> rising edge of controlbitprime:
'         IF mixer_prime_running -> abort (close solenoid, reset counter).
'         ELSE -> interlock check (motor OFF, normal cycle idle, prime
'         params > 0).  If OK, start: zero shot counter, TICKS=0, set
'         mixer_prime_running = TRUE.  Otherwise press is ignored.
'      3. Running:            run_prime_cycle fires <prime_count> shots
'                             at <prime_interval> spacing, each <on_time>
'                             wide.  Motor held OFF every scan.  Shot count
'                             published to mixer_prime_shots_fired live.
'      4. Complete:           mixer_prime_running -> FALSE, motor stays OFF.
'                             Shot counter retains final value so operator
'                             sees the completion count on the HMI.
'
'   Prime takes priority: while mixer_prime_running = TRUE, the normal lube
'   cycle (state machine A) is suspended -- no kickstart, no shots, no motor
'   enable.  When prime completes or aborts, the normal cycle resumes
'   evaluation on the next scan.  Because the prime interlock requires the
'   normal cycle to be idle, in practice this just means prime fires its
'   shots and then control returns to idle.
'
' RUN REQUEST
'   run_requested = controlbitrun OR (pump_a_active AND lube_with_pumps)
'   MIXER.BAS owns OP(out_mixerrun) outright; the HMI must NOT write to that
'   OP bit directly.  HMI starts the normal cycle by setting
'   mixer_controlword_vr bit mixer_ctrl_bit_run (bit 4).
'
' INTERLOCKS
'   * Motor never turns on dry: init phase forces OP(out_mixerrun, OFF)
'     every scan while starting_mixer = TRUE.  Motor enables only after the
'     init count completes (or skipped path with count = 0).
'   * Prime forces OP(out_mixerrun, OFF) every scan while running.
'   * Prime cannot start if motor is energized, normal cycle is active, or
'     prime params are <= 0.  Press is silently ignored when interlock fails.
'
' BUG HISTORY
'   2026-05-10  M-NF-11 (FIXED) -- first init shot truncated to one-scan blip.
'                Moved kickstart out of mixer_lube into the outer program loop
'                as a one-shot edge detect.
'   2026-05-10  M-NF-13 (FIXED) -- no operator-cancellable path during init
'                lube; added controlbitrun as the explicit run request and
'                soft-abort on clear.  Also unified lube on-time to VR 552
'                across all phases (the luber meters by shot count, not
'                pulse width).
'   2026-05-11  Prime cycle revised -- now a standalone maintenance action
'                that fires shots into an empty passage WITHOUT starting the
'                mixer motor.  Decoupled from the normal cycle; replaces the
'                earlier "armed flag that hijacks the init phase" design.
'======================================================================

'mixer SPEED setpoint
dac_per_speed = mixer_dac_max / mixer_max_speed
'mixer speed reference
speed_per_dac = mixer_max_speed / mixer_dac_max
last_speed = 0
initial_lube_cntr = 0
mixer_prime_shots_fired = 0
mixer_was_off = TRUE
starting_mixer = FALSE
mixer_start_lube_done = FALSE
mixer_prime_running = FALSE
intervaltriggered = FALSE
init_target_count = 0
init_target_interval = 0
OP(out_mixer_lube, OFF)
OP(out_mixerrun, OFF)
mixer_statusword_vr = 0
TICKS = mixer_head_run_lube_interval * 1000

'-- Defensively zero the entire mixer controlword and sync the edge-detect
'   latch so prime/normal cycles cannot self-trigger at boot.  Without this,
'   if bit 4 (run) or bit 5 (prime) of VR 7 happened to be 1 at the moment
'   MIXER.BAS first ran (e.g., HMI default state, stale value after a Motion
'   Perfect program reload, or a held button), the very first scan of
'   handle_prime_button or the normal-cycle dispatch would synthesize a
'   "rising edge" the operator never produced -- spontaneously starting a
'   prime cycle (luber firing on its own) or a normal mixer cycle.
'   INIT_PARAMETERS.BAS zeros traverse/pump/niproll controlwords on boot
'   (lines 142-146) but does NOT touch mixer_controlword_vr; this matches
'   that pattern and closes the gap.
mixer_controlword_vr = 0
prime_btn_last = 0

program_loop:
GOSUB set_mixer_speed
GOSUB mixer_speed_reference
GOSUB handle_prime_button

IF mixer_prime_running THEN
    'Prime cycle takes priority: fire shots, hold motor off, suspend
    'normal cycle.  Works in either Auto or Manual mode -- the operator
    'can prime a freshly installed mixer head without first switching
    'into Auto.
    GOSUB run_prime_cycle
ELSE
    IF triocontrolword_vr.automode = 1 THEN
        'NOTE: pass the literal VR number 7 to READ_BIT, not the
        'mixer_controlword_vr GLOBAL alias.  When a GLOBAL is used as a
        'function argument, TrioBASIC evaluates it to the VR's VALUE, not
        'its VR number -- so passing the alias would read bits from
        'VR(value_of_VR_7) (some arbitrary VR), which silently picks up
        'bits from unrelated registers and was causing the mixer to start
        'as soon as automode was toggled.  All other READ_BIT/SET_BIT
        'calls in the codebase use literal VR numbers for this reason
        '(e.g., READ_BIT(nip_roll_status_running_bit, 5000) in NIP_ROLL).
        ctrl_run = READ_BIT(mixer_ctrl_bit_run, 7)
        pump_run_request = (MTYPE AXIS(axis_pump_a) <> mtype_idle) AND lube_with_pumps
        run_requested = ctrl_run OR pump_run_request
        cycle_active = starting_mixer OR mixer_start_lube_done

        IF cycle_active AND run_requested = 0 THEN
            'Operator (or pump-A path) cleared the request mid-cycle -- soft abort
            GOSUB abort_cycle
        ELSE
            IF run_requested OR cycle_active THEN
                'Off -> on kickstart on the rising edge of run_requested
                IF mixer_was_off AND mixer_start_lube_done = FALSE THEN
                    GOSUB kickstart_cycle
                ENDIF
                GOSUB mixer_lube
            ELSE
                'Idle: clean up any stale state
                IF mixer_was_off = FALSE THEN GOSUB reset_to_idle
            ENDIF
        ENDIF
    ELSE
        'Manual mode: solenoid mirrors jog-forward button
        OP(out_mixer_lube, mixer_controlword_vr.controlbitjogfwd)
    ENDIF
ENDIF

GOSUB update_status_bits
GOTO program_loop


'======================================================================
' Subroutines
'======================================================================

set_mixer_speed:
mixerspeed_dac = mixer_head_speed_sp * dac_per_speed
AOUT(6) = mixerspeed_dac
last_speed = mixerspeed_dac
RETURN

mixer_speed_reference:
IF READ_OP(out_mixerrun) THEN
    mixer_reference_speed = INT((AIN(analogin_mixer_speed_ref) - zero_offset) * speed_per_dac)
ELSE
    zero_offset = AIN(analogin_mixer_speed_ref)
    mixer_reference_speed = 0
ENDIF
'Alarm horn if 1000 RPM difference
OP(out_stacklight_horn, (ABS(mixer_head_speed_sp - mixer_reference_speed) > 1000) AND _
    READ_OP(out_mixerrun))
RETURN

handle_prime_button:
'Edge-detect mixer_ctrl_bit_prime (rising edge only).
'  Press while idle and interlocks OK -> start prime cycle.
'  Press while priming -> abort.
'  Press while normal cycle active or motor running -> ignored (interlock
'  failure; HMI Priming lamp stays off, signaling to the operator that
'  the press didn't take).
'  Press with prime params <= 0 -> ignored (signals operator to enter
'  values before priming).
'See the comment in program_loop above for why we pass literal 7 instead
'of the mixer_controlword_vr alias.
prime_btn_now = READ_BIT(mixer_ctrl_bit_prime, 7)
IF prime_btn_now = 1 AND prime_btn_last = 0 THEN
    IF mixer_prime_running THEN
        'Abort the prime run
        mixer_prime_running = FALSE
        OP(out_mixer_lube, OFF)
        intervaltriggered = FALSE
        'Leave mixer_prime_shots_fired showing partial count so operator
        'sees where the abort happened; it resets on the next prime start.
    ELSE
        'Try to start prime; check interlocks
        IF READ_OP(out_mixerrun) = 0 AND _
           starting_mixer = FALSE AND _
           mixer_start_lube_done = FALSE AND _
           mixer_head_prime_lube_count > 0 AND _
           mixer_head_prime_lube_interval > 0 AND _
           mixer_head_init_lube_on_time > 0 THEN
            mixer_prime_running = TRUE
            mixer_prime_shots_fired = 0
            intervaltriggered = FALSE
            TICKS = 0
        ENDIF
    ENDIF
ENDIF
prime_btn_last = prime_btn_now
RETURN

run_prime_cycle:
'Independent prime state machine: fire mixer_head_prime_lube_count shots
'into an empty lube passage.  Mixer motor stays OFF throughout.  When the
'count is reached, mixer_prime_running clears and control returns to idle
'(no motor enable).
OP(out_mixerrun, OFF)
IF TICKS < 1 THEN
    IF intervaltriggered = FALSE THEN
        '--- Pulse start ---
        intervaltriggered = TRUE
        OP(out_mixer_lube, ON)
        TICKS = mixer_head_init_lube_on_time * 1000
    ELSE
        '--- Pulse end ---
        OP(out_mixer_lube, OFF)
        intervaltriggered = FALSE
        mixer_prime_shots_fired = mixer_prime_shots_fired + 1
        IF mixer_prime_shots_fired >= mixer_head_prime_lube_count THEN
            'Prime complete; do NOT start the mixer motor
            mixer_prime_running = FALSE
            'Leave mixer_prime_shots_fired at final value for HMI feedback;
            'it gets re-zeroed on the next prime start.
        ELSE
            TICKS = mixer_head_prime_lube_interval * 1000
        ENDIF
    ENDIF
ENDIF
RETURN

kickstart_cycle:
'One-shot entry into the normal init lube phase on the off->on edge of
'run_requested.  Snapshots target count/interval so they cannot change
'mid-flight, then either fires the first init shot (count >= 1) or skips
'straight to run phase (count = 0).
'On-time is read live from mixer_head_init_lube_on_time (VR 552) on every
'pulse (single unified VR -- see header).
mixer_was_off = FALSE
initial_lube_cntr = 0
mixer_prime_shots_fired = 0
intervaltriggered = FALSE
OP(out_mixerrun, OFF)
init_target_count = mixer_head_init_lube_count
init_target_interval = mixer_head_init_lube_interval
IF init_target_count < 1 THEN
    'Zero-count guard: skip init phase entirely, go straight to run cadence
    mixer_start_lube_done = TRUE
    starting_mixer = FALSE
    OP(out_mixerrun, ON)
    TICKS = mixer_head_run_lube_interval * 1000
ELSE
    starting_mixer = TRUE
    TICKS = 0
ENDIF
RETURN

mixer_lube:
'Normal lube state machine (init + run phase).  Hold the motor off for the
'entire init phase so external writes to out_mixerrun can't sneak the motor
'on mid-sequence.
IF starting_mixer THEN
    OP(out_mixerrun, OFF)
ENDIF
IF TICKS < 1 THEN
    IF intervaltriggered = FALSE THEN
        '--- Pulse start: solenoid ON, arm the on-time countdown ---
        intervaltriggered = TRUE
        OP(out_mixer_lube, ON)
        TICKS = mixer_head_init_lube_on_time * 1000
    ELSE
        '--- Pulse end: solenoid OFF, count the shot, schedule next interval ---
        OP(out_mixer_lube, OFF)
        intervaltriggered = FALSE
        IF starting_mixer AND mixer_start_lube_done = FALSE THEN
            initial_lube_cntr = initial_lube_cntr + 1
            IF initial_lube_cntr >= init_target_count THEN
                'Init phase complete: enable motor, switch to run cadence
                mixer_start_lube_done = TRUE
                starting_mixer = FALSE
                OP(out_mixerrun, ON)
                TICKS = mixer_head_run_lube_interval * 1000
            ELSE
                'More init shots to fire
                TICKS = init_target_interval * 1000
            ENDIF
        ELSE
            'Run phase
            TICKS = mixer_head_run_lube_interval * 1000
        ENDIF
    ENDIF
ENDIF
RETURN

abort_cycle:
'Soft abort of the normal cycle.  Closes solenoid, forces motor off, resets
'all state.  Does NOT touch mixer_prime_running -- if a prime is happening
'at the same time this is reached, the dispatch in program_loop would never
'have entered this branch.
OP(out_mixer_lube, OFF)
OP(out_mixerrun, OFF)
intervaltriggered = FALSE
mixer_was_off = TRUE
initial_lube_cntr = 0
starting_mixer = FALSE
mixer_start_lube_done = FALSE
TICKS = mixer_head_run_lube_interval * 1000
RETURN

reset_to_idle:
'Clean up stale normal-cycle state when returning to idle without a run
'request.  Same as abort_cycle minus the motor force-off (motor is already
'off in idle).
OP(out_mixer_lube, OFF)
intervaltriggered = FALSE
mixer_was_off = TRUE
initial_lube_cntr = 0
starting_mixer = FALSE
mixer_start_lube_done = FALSE
TICKS = mixer_head_run_lube_interval * 1000
RETURN

update_status_bits:
'Publish state to mixer_statusword_vr (VR 15) for HMI display.
'Full-VR write -- nothing else uses mixer_statusword_vr.
'  bit 0  running     -- mixer motor energized
'  bit 1  initing     -- normal cycle init phase active
'  bit 2  priming     -- prime cycle active (luber firing, motor off)
'  bit 3  unused
mixer_status_tmp = 0
IF READ_OP(out_mixerrun) THEN mixer_status_tmp = mixer_status_tmp + 1
IF starting_mixer THEN mixer_status_tmp = mixer_status_tmp + 2
IF mixer_prime_running THEN mixer_status_tmp = mixer_status_tmp + 4
mixer_statusword_vr = mixer_status_tmp
RETURN
