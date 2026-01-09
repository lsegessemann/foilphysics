# foilphysics V1 - the simplest model
## Interactive Pump Foil Simulator

**Project Overview:**

This project is a standalone, browser-based physics simulator designed to visualize and understand the mechanics of pump foiling. 
It models the hydrodynamics of a hydrofoil wing undergoing a pumping motion and calculates the resulting forces, thrust, and rider power requirements in real-time.
You can run the simulator directly in your browser here:[Live Demo](https://luciensegessemann-ops.github.io/foilphysics/)

The simulator provides an interactive playground for riders, engineers, and enthusiasts to experiment with different foil setups (wing area, aspect ratio) and pumping techniques (frequency, amplitude, timing) to see how they affect efficiency and acceleration.

**Simplifications**
- All forces are modelled on the front wing directly, which is assumed to be rigid
- Frontwing has a symmetrical profil
- Rear wing / stabilizer is neglected, steady state pumping motion assumed
- The stickfigure is only there for your entertainment


**Key Features**

- Physics Engine: Custom 2D quasi-steady simulation loop that calculates Lift, Drag, Rider Inertia, and Net Thrust based on user inputs.

- Realistic Fluid Dynamics: Includes finite wing corrections for Aspect Ratio, affecting both the Lift Slope and Induced Drag (Drag Polar).

- Real-Time Visualization:Vector Display: Live arrows showing Lift (Blue), Drag (Red), Rider Input (Orange), and Net Thrust (Cyan).

- Live Telemetry: Digital readout of Speed, Angle of Attack (AoA), Pitch, and Instantaneous/Average Wattage.

- Dynamic Graphs: Scrolling history charts for Net Thrust (Green/Red zones for accel/decel) and Rider Power.

- Interactive Controls: Adjust Pumping Frequency, Amplitude, and Phase Shift (timing between heave (stomp) and pitch).

- Gear Setup: Modify Wing Area, Aspect Ratio, Foil Mass, and Pitch Trim.

- Conditions: Set the simulated Cruise Speed.

- Visual Enhancements: Toggles for vector visibility, foil assembly rendering, and scaling options.

Technical Details 
- Tech Stack: Pure HTML5 Canvas & Vanilla JavaScript (ES6). No external dependencies or libraries.

**Physics Model**
- Kinematics: Sinusoidal motion for Heave ($z$) and Pitch ($\theta$) that can be shifted in phase.

- Hydrodynamics: Thin airfoil theory modified for finite Aspect Ratio ($C_L = \frac{2\pi\alpha}{1 + 2/AR}$) and induced drag ($C_D = C_{D0} + kC_L^2$).

- Dynamics: Solves for required Rider Force ($F_{rider}$) by balancing Inertial forces against Hydrodynamic Lift ($F_{rider} = F_{inertia}-F_{hydro}).

File Structure: Single-file index.html containing CSS, HTML layout, and the JS simulation engine.

How to Run Locally: Click on live Demo above or simply download the index.html file and open it in any modern web browser (Chrome, Firefox, Safari). No server or installation is required.
