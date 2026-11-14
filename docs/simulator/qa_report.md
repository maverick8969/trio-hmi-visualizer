# QA Report — TrioBASIC Controller Simulator (Novex Line 2)

Adversarial review of the interpreter/engine plus verification of the four reported
code findings. All results are backed by executable probes under `/root/sim-build/tests/`
(`qa_expr.js`, `qa_sched.js`, `qa_sched2.js`, `qa_plant.js`, `qa_exitloop.js`, `qa_ast.js`).

## Overall verdict

**The simulator faithfully executes the project.** Boot reaches `SYSTEMSTATUS = 0x28 (40)`,
E-stop drops WDOG within **1 ms**, reset returns to `0x28`, plant coupling (heaters, pump
flow) is correct, and the scheduler honours the 1-scan-per-slice / paced-`WA` model. The
parser correctly handles every dense real line spot-checked. Expression precedence for the
operators the project actually uses (comparison tighter than AND/OR, `=`/`<>`, named
`alias.bit` and `VR(n).bit` read+write) is correct.

**One real engine bug** was found (`EXIT_LOOP` inside `FOR` corrupts/leaks the FOR stack).
The remaining engine issues are **latent divergences** that the shipped programs do not
exercise (bitwise vs logical AND/OR/NOT/XOR, unary-minus vs `^`, numeric `.N` bit fields).
The four reported code findings are **all real** and are faithfully reproduced by the engine.

---

## 1. Ranked ENGINE bugs

### BUG-1 [MEDIUM] `EXIT_LOOP` inside `FOR` never pops `forStack` — leak now, corruption if nested
- **File:** `visualizer/js/sim/trio-runtime.js`
  - `compileStmt` `case 'exitloop'` (~L75-79) emits a bare `JMP` to the loop end.
  - `compileFor` (~L108-119): the FOR frame is pushed by `FORINIT` and popped **only** by
    `FORTEST` when the loop finishes (`execOp 'FORTEST'`, ~L380-386, `p.forStack.pop()`).
  - `EXIT_LOOP` jumps to `end`, which is *past* `FORTEST`, so the pushed FOR frame is never
    removed.
- **Repro (`qa_exitloop.js`):**
  - Single `FOR i=1 TO 5 : IF i=2 THEN EXIT_LOOP : NEXT` → `forStack.length = 1` after (want 0).
  - Nested `FOR o=1 TO 3 { FOR inner=1 TO 5 { IF inner=2 THEN EXIT_LOOP } }` → outer body runs
    **5** times (final `o=6`) instead of **3**: the stale inner frame is read by the outer
    `FORNEXT/FORTEST`, so the outer bound becomes the inner's `limit=5`.
  - `loop: FOR i=1 TO 5 : IF i=2 THEN EXIT_LOOP : NEXT : GOTO loop` → `forStack` grows **+1 per
    scan** (5 after 5 scans) — unbounded.
- **In-project impact:** both `EXIT_LOOP` sites exit a `FOR` (not nested in another `FOR`):
  `ERROR_CHECK_AND_RESET.BAS:114-119` (reset "clear first faulted axis") and
  `INIT_PARAMETERS.BAS:104-111` (EtherCAT retry, inside a `WHILE`). No control corruption today
  (siblings push their own frame first), but each E-stop→reset cycle that finds a faulted axis
  **leaks one `forStack` frame**, growing without bound across repeated resets, and boot leaks up
  to 3. It becomes a hard correctness bug the moment anyone nests a FOR+EXIT_LOOP.
- **Fix:** make `EXIT_LOOP` pop the enclosing FOR frame. E.g. in `compileFor`, record the
  `forStack` depth at loop entry and emit a `FORPOP`/depth-truncate op at `end`; or tag
  `loopEndPatches` frames with their loop kind and, for FOR loops, emit a pop immediately before
  the `EXIT_LOOP` `JMP`. WHILE/REPEAT need no change (they don't use `forStack`).

### BUG-2 [LOW] Overhead-zone sensor aliasing (io_map §D) not implemented
- **File:** `visualizer/js/sim/trio-runtime.js` `readVar` (~L635-663) — undeclared identifiers
  resolve to an auto-local `0`; there is no special mapping for
  `analogin_overhead_heat_zone1/2/3_tc`.
- **Consequence:** `HEATER_OFFON_CONTROL.BAS:27-29` reads `DV_IN(0)` for all three overhead
  zones (the alias names are undefined → 0). io_map §D says the sim **must** treat these as
  `5/6/7`; it does not. Verified in `qa_plant.js`: with ΔP-A hot (DV_IN0=94 °F) and overhead-1
  cold (DV_IN5=70 °F), the zone-1 read follows DV_IN0.
- **Note / disposition:** this is a deliberate-looking tension. Resolving to `0` is *faithful to
  real Trio* (undeclared name = local 0), so it correctly reproduces the real code bug (finding
  a). It only "fails" against io_map §D's request to paper the bug over. Left as a low-priority
  spec-compliance gap; if the demo needs the overhead PVs to move, add the alias mapping in
  `readVar` (or seed the three names as CONSTANT 5/6/7).

### BUG-3 [LOW] AND/OR/NOT are logical (truthy), not bitwise; `XOR` unimplemented
- **File:** `visualizer/js/sim/trio-runtime.js` `evalExpr` `case 'logical'` (~L605-609) and
  `case 'unary'` NOT (~L601); `visualizer/js/sim/trio-parser.js` `parseOr/parseAnd` (~L420-429)
  have no `XOR`.
- **Evidence (`qa_expr.js`):** `6 AND 3 → 1` (Trio bitwise = 2); `4 OR 2 → 1` (=6);
  `NOT 0 → 1` (Trio = -1), `NOT 1 → 0` (Trio = -2); `5 XOR 1 → 5` — the `XOR 1` term is
  silently dropped by the parser.
- **In-project impact:** none observed — every AND/OR/NOT operand in the shipped code is a
  boolean (comparison, `.bit`, `READ_BIT`, or a 0/1 flag), where logical and bitwise agree, and
  `XOR` is never used. Latent: any real bitmask (`x AND $F0`, merging flag bits with `OR`,
  complementing with `NOT`, or any `XOR`) would evaluate wrong / mis-parse.
- **Fix:** implement AND/OR/XOR/NOT as integer bitwise ops (`Math.trunc` operands), matching Trio;
  add `XOR` to the parser at the OR tier.

### BUG-4 [LOW] Unary minus binds tighter than `^` (and `^` is left-associative)
- **File:** `trio-parser.js` `parsePow` (~L465-469) calls `parseUnary` for its base, so
  `parseUnary` (~L470-474) binds first.
- **Evidence:** `-2^2 → 4` ((-2)^2) instead of Trio's `-(2^2) = -4`; `2^3^2 → 64` (left-assoc)
  vs right-assoc 512.
- **Impact:** none — no `-x^y` / chained-power expressions in the project. Cosmetic.

### BUG-5 [LOW] Numeric bit field `.N` mis-lexed as a float
- **File:** `visualizer/js/sim/trio-lexer.js` number rule (~L127): after any token, `.<digit>`
  is tokenized as a float (`0.N`) instead of `DOT` + digit, so `VR(n).3` / `alias.3` cannot form
  a `bit` node.
- **Evidence (`qa_expr.js`):** `VR(122).3 = 1` leaves `VR122 = 0` (write lost); `VR(130).0`
  raises a parse error.
- **Impact:** none — the project always uses **named** bit constants (`.statusbithomed`,
  `.estop_active`, …), which work correctly (verified read+write for both `alias.bit` and
  `VR(n).bit`). Latent for any numeric-literal bit index.

*Minor/by-design:* `/` and `MOD` by zero return `0` (real Trio raises a run error); `INT()` uses
`trunc`. Not corrected — defensive and harmless for this project.

---

## 2. Confirmation table — the four reported CODE findings

| # | Finding | Real? | Evidence | Consequence (as executed by the engine) |
|---|---------|-------|----------|------------------------------------------|
| a | `analogin_overhead_heat_zone1/2/3_tc` undefined in `HEATER_OFFON_CONTROL` | **YES** | Used at `HEATER_OFFON_CONTROL.BAS:27-29`; never `GLOBAL/CONSTANT` (grep). Only `AnalogIn_Overhead_Heater_1/2/3 = 5/6/7` exist (`START:75-77`). | All three names → auto-local `0` → `DV_IN(0)`. All three overhead zones read the **mixer ΔP-A RTD** instead of DV_IN 5/6/7. Overhead thermostat controls OP20/21/22 off the wrong sensor. (Engine is faithful to real Trio; see BUG-2 re io_map §D.) |
| b | `bdo_cart_pid_out_start_wd` undefined at `START:887` → `MIXER_HEAD_*` map to VR 0-6 | **YES** | `START:887-893` uses `bdo_cart_pid_out_start_wd` (undefined) as base; intended const is `MIXERHEAD_PID_OUT_start_wd = 1920` declared one line above (`START:886`). Verified: `mixer_head_xout`→VR **0**, `mixer_head_at_low_limit`→VR **6**. | The 7-word PID-out block lands on VR 0-6. VR **1-6 are the live control words** (`TrioControlWord_VR=1`, `Traverse/PumpA/PumpB/PumpC/NipRoll_ControlWord_VR=2..6`). Currently **dormant** (no code references `MIXER_HEAD_xout…`), but enabling mixer-head cartridge PID would clobber all control words. |
| c | `save_recipe` (RECIPES) vs declared `save_receipe` (VR97) typo | **YES** | `RECIPES.BAS:13` `IF save_recipe=1`, `:64` `save_recipe=0`; only `GLOBAL "save_receipe",97` exists (`START:359`). `save_recipe` is not a global (verified `globals.get` = undefined). | `save_recipe` is a RECIPES-process local (always 0). An HMI/SCADA write to `save_receipe` (VR97) is **never seen** by RECIPES — the Save-Recipe request is silently ignored. |
| d | `manual_btn_pump_a/b/c` never declared `GLOBAL` | **YES** | Read in `PUMPS_RUN.BAS:212/221/230/242`, written in `ERROR_CHECK:70-72`; no `GLOBAL/CONSTANT/DIM` (grep). Verified `globals.get('manual_btn_pump_a')` = undefined. | Each is a **per-process local**. PUMPS_RUN reads its own local; ERROR_CHECK's E-stop "clear manual pump buttons" writes ERROR_CHECK's own local. The manual-jog buttons never cross processes and the E-stop clear is a no-op on an unrelated local. |

All four are genuine defects in the TrioBASIC source; the engine reproduces them exactly as a
real Trio controller would (undeclared name → per-process local = 0). They are **code** bugs, not
engine bugs.

---

## 3. Focus-area results (PASS/FAIL with evidence)

### 1. Expression semantics — **PASS** (for project-used operators)
- Comparison binds tighter than AND/OR: `5>3 AND 2>4 → 0`, `1=2 OR 3=3 → 1`. PASS.
- `=` equality vs assignment, `<>`: `VR100=3` then `(VR100=3) → 1`; `5<>4 → 1`, `4<>4 → 0`. PASS.
- `alias.bitconst` read+write (global VR): write bit2 of VR200 → 4; read back → 1. PASS.
- `VR(n).bitconst` read+write: `VR(120).mybit(3)=1` → 8; `VR(124)=8; VR(124).b3 → 1`. PASS.
- Integer bit read floors floats (`Math.floor` in `getVrBit`/`bit`). PASS.
- FAIL (latent only): bitwise AND/OR/NOT/XOR (BUG-3), numeric `.N` bit (BUG-5), `-x^y` (BUG-4).

### 2. Scheduler fidelity — **PASS** (`qa_sched2.js`)
- `label: … GOTO label` → exactly **1 scan/slice** (100 ticks → 100 iterations). PASS.
- `FOR`/`WHILE`/`REPEAT` complete **within one scan** (FOR 1000 in 1 tick; WHILE 500 in 1 tick;
  internal back-edges don't yield). PASS.
- `WA(100)` sleeps 100 ms (1000 ms → 10 iterations). PASS.
- `WAIT UNTIL` polls once/slice until true (resumes the tick after `VR500=1`). PASS.
- Tight-loop starvation: a peer tight loop still advances 1/slice (both hit 100 in 100 ticks) —
  each process gets one `runScan` per tick regardless of a peer's busy loop. PASS.

### 3. Safety chain (behavior_spec §3) — **PASS** (`qa_sched.js`)
- Boot: `SYSTEMSTATUS = 40 (0x28)`, WDOG=1, SERVO 0-3 = 1, all expected procs alive. PASS.
- E-stop (`IN0=0 & WDOG=ON`): WDOG dropped after **1 ms**; `estop_active` (bit0) set;
  SERVO 0-3 → 0; axes MTYPE → idle; `hmi_pumps_run` → 0; `SYSTEMSTATUS → 9` (0x08|0x01,
  DriveEnabled cleared). Reaction latency ≤ a few ms. PASS.
- Reset (release + `safety_relay_reset` → OP4 pulse → `manual_reset` → re-enable): returns to
  `SYSTEMSTATUS = 40`, WDOG=1, SERVO 0-3 = 1. PASS.

### 4. Plant coupling (io_map §G) — **PASS** (`qa_plant.js`)
- Heaters OP20/21/22 → DV_IN5/6/7 & PV VR 1140/1240/1340 (°F); OP9/7/8 → DV_IN2/0/1: every zone
  **heats when ON, cools when OFF**; PV VRs track in °F. PASS.
- Pump MSPEED → flow VR: axis1 mspeed 100 → VR602 = 50 (cal 0.5); axis2 → VR632 = 50. PASS.
- (See BUG-2: the *code* reads the wrong DV_IN for overhead zones, but the plant→sensor coupling
  itself is correct.)

### 6. Parser edge cases — **PASS** (`qa_ast.js`)
Correct ASTs for: `CANCEL(2) AXIS(axisno)`, `MSPEED AXIS(n) > .01`, `PROC_STATUS PROC(n)=0`,
`FE_LIMIT AXIS(n)=.5`, `alias.bit = 0`, inline `IF … THEN … ELSE …`, `_` line continuation,
`PRINT #5, …`, `OP(0,15,FALSE)`, `ETHERNET(1,-1,7,0)`, nested `AND` chains. No silent mis-parses
found on the dense lines sampled from START/HMI/MIXER/ERROR_CHECK. (Numeric `.N` bit fields would
mis-lex — BUG-5 — but the project uses none.)
