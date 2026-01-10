## Physics Model

The simulation uses a custom quasi-steady solver that iterates through time steps ($dt$) to calculate forces and rider power.

### Simplifications
- All forces act directly on the front wing, which is assumed to be rigid
- The indication bars for average lift and thrust indicate whether the pumping motion is actually viable for the selected speed. If they're not balanced / on target, the selected parameters are not in steady state.
- There is no stabilizer/rear wing modelled
- The stickfigure is only there for your entertainment - the trajectory of the foil is defined by the frequency and amplitude input.


### 1. Kinematics (Motion)
The rider's vertical motion (**Heave**) and the board's angle (**Pitch**) are driven by sinusoidal functions, linked by a configurable **Phase Shift**.

- **Frequency:** $\omega = 2\pi f$
- **Vertical Position ($z$):** $z(t) = A \cos(\omega t)$
- **Vertical Velocity ($v_z$):** $v_z(t) = -A \omega \sin(\omega t)$
- **Vertical Acceleration ($a_z$):** $a_z(t) = -A \omega^2 \cos(\omega t)$
- **Pitch Angle ($\theta$):** $\theta(t) = \theta_{trim} + \theta_{amp} \cos(\omega t + \phi)$
  *(Where $\phi$ is the Phase Shift)*
- **Standard Phase:** $\phi = \omega t$
- **Asymmetric Phase:** $\phi_{asym} = \phi - \text{Asymmetry} \cos(\phi)$
- **Vertical Position ($z$):** $z(t) = A \cos(\phi_{asym})$
- **Vertical Velocity ($v_z$):** $v_z(t) = -A \sin(\phi_{asym}) \frac{d\phi_{asym}}{dt}$
- **Vertical Acceleration ($a_z$):** Calculated as the derivative of $v_z$.
- **Pitch Angle ($\theta$):** $\theta(t) = \theta_{trim} + \theta_{amp} \cos(\phi_{asym} + \phi_{shift})$

### 2. Fluid Forces
Lift and Drag are calculated using **Thin Airfoil Theory**, corrected for a finite Aspect Ratio ($AR$).

- **Flight Path Angle ($\gamma$):** $\gamma = \arctan(v_z / U)$
- **Effective Angle of Attack ($\alpha$):** $\alpha = \theta - \gamma$
- **Lift Coefficient ($C_L$):**
  $$C_L = \frac{2 \pi \alpha}{1 + 2/AR}$$
- **Drag Coefficient ($C_D$):**
  $$C_D = C_{D0} + k C_L^2 \quad \text{where} \quad k \approx \frac{1}{\pi AR}$$
- **Hydrodynamic Force (Vertical Component):**
  $$F_{hydro\_z} = L \cos(\gamma) - D \sin(\gamma)$$

### 3. Dynamics (Two-Mass Model)
To simulate high-frequency pumping accurately, the system is split into a **Fixed Mass** (Torso) and a **Moving Mass** (Legs + Board). This prevents the "zero power" error seen in single-point mass models when acceleration exceeds gravity.

- **Moving Mass ($m_{moving}$):**
  $$m_{moving} = m_{board} + (m_{rider} \times \text{SwingRatio})$$
  *(Default SwingRatio is 0.4, representing the active mass of the legs)*
- **Inertial Requirement:**
  The force required to accelerate the legs and board:
  $$F_{inertia} = m_{moving} (g + a_z)$$
- **Rider Force ($F_{rider}$):**
  The rider must push down to bridge the gap between the Water Force and the Inertial Force.
  $$F_{req} = F_{hydro\_z} - F_{inertia}$$
  $$F_{rider} = \max(0, F_{req})$$
  *(Clamped to 0 to simulate unstrapped riding—the rider cannot pull the board up).*

### 4. Power Calculation
Power is calculated as the product of the Rider's Force and the Leg Extension Velocity.

- **Extension Velocity:** $v_{ext} = -v_z$ *(Positive when pushing down)*
- **Instantaneous Power:**
  $$P_{inst} = F_{rider} \times v_{ext}$$
  $$P = \max(0, P_{inst})$$
  *(Negative power is clamped to 0, assuming the rider does not regenerate energy from the board pushing back).*

### 5. Power Metrics (Normalized vs Average)
- **Average Power:** The arithmetic mean of the power output ($P_{avg} = \frac{1}{N} \sum P$). It represents the total physical work done.
- **Normalized Power:** A weighted average that emphasizes high-intensity spikes. Since physiological fatigue increases non-linearly with intensity, this metric better represents the metabolic "cost" of the session.
  $$P_{norm} = \sqrt[4]{\frac{1}{N} \sum P^4}$$

## Model Limitations

### 1. Aerodynamic Limitations
- **No Stall Characteristics (Linear Lift):** The simulation uses Thin Airfoil Theory ($C_L = 2\pi\alpha$). It assumes lift increases forever as pitch increases. In reality, foils "stall" (lose lift abruptly) around 12–15° Angle of Attack.
  - *Consequence:* The simulation might report that a steep, slow pump is "efficient," whereas in reality, the wing would stall and the rider would crash.
- **Simplified Drag Model:** Drag is calculated using a simple parabolic polar ($C_D = C_{D0} + k C_L^2$). This ignores "separation drag" at high angles of attack and interference drag between the mast and wing.
- **No Rear Wing (Stabilizer):** The code explicitly ignores the stabilizer. In reality, the stabilizer creates negative lift to balance the pitching moment, which adds drag and increases the lift requirement for the front wing.

### 2. Hydrodynamic Limitations
- **No Surface Ventilation:** The physics engine calculates lift regardless of depth. It does not detect if the wing breaches the surface ($z > 0$).
  - *Consequence:* The simulation allows the rider to pump 1 meter above the water surface with full lift, which is physically impossible.
- **Missing "Added Mass":** Accelerating a wing underwater requires moving the water around it (virtual mass). The code accounts for the board and leg mass ($m_{moving}$), but ignores the hydrodynamic added mass.
  - *Consequence:* High-frequency pumping requires significantly more energy in reality than this simulation predicts.

### 3. Biomechanical Limitations
- **Infinite Muscle Strength:** The rider is modeled as an ideal force generator. The simulation might say "Requires 1200 Watts," but it doesn't know that a human cannot generate 1200 Watts. It does not implement Hill's Muscle Equation (the trade-off between force and speed).
- **Perfectly Rigid Transmission:** The "Two-Mass Model" assumes the board and legs move as one solid unit relative to the water forces. It ignores the flex of the mast and the fuselage, which can dampen energy transfer.
- **Forced Kinematics (The "Rail" Effect):** The motion is defined by math ($z = A \cos(\omega t)$), not by forces. The board is essentially moving on a predefined invisible rail.
  - *Consequence:* If the rider stops pedaling (power = 0), the simulation doesn't show the board slowing down or sinking; it just shows "Rider Force = 0". The board never "crashes."

### 4. Mathematical Simplifications
- **Quasi-Steady Assumption:** The solver calculates forces based only on the current instant's velocity and angle. It ignores "unsteady aerodynamics" (Theodorsen effects/Wagner function), where the wake from the previous stroke affects the current lift. This is usually acceptable for low frequencies but becomes inaccurate above ~2-3 Hz.
- **No Pitching Moment:** The code solves for vertical forces ($F_z$) and forward forces ($F_x$), but ignores the rotational torque (Pitching Moment). In reality, the rider must exert leverage to keep the board level, which is a major source of fatigue.