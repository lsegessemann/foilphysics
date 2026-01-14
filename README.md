## Physics Model

The simulation uses a custom quasi-steady solver that iterates through time steps ($dt$) to calculate forces and rider power.

### Simplifications
 - Forces are calculated for the front wing, rear stabilizer, and mast
- The indication bars for average lift and thrust indicate whether the pumping motion is actually viable for the selected speed. If they're not balanced / on target, the selected parameters are not in steady state.
- The stickfigure is only there for your entertainment - the trajectory of the foil is defined by the frequency and amplitude input.


### 1. Kinematics (Motion)
The rider's vertical motion (**Heave**) and the board's angle (**Pitch**) are driven by sinusoidal functions, linked by a configurable **Phase Shift**.

- **Frequency:** $\omega = 2\pi f$
- **Vertical Position ($z$):** $z(t) = A \cos(\omega t)$
- **Vertical Velocity ($v_z$):** $v_z(t) = -A \omega \sin(\omega t)$
- **Vertical Acceleration ($a_z$):** $a_z(t) = -A \omega^2 \cos(\omega t)$
- **Pitch Angle ($\theta$):** $\theta(t) = \theta_{trim} + \theta_{amp} \cos(\omega t + \phi)$
  *(Where $\phi$ is the Phase Shift)*
- **Physical Execution:** The rider achieves this by shifting their weight (Center of Pressure) forward or backward relative to their vertical extension. A 90° shift means pitching the nose down exactly when moving fastest downwards. A higher shift (>90°) means initiating the pitch change *early* (leading the motion).
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
- **Stall Model:**
  Beyond a critical angle (~13°), the lift coefficient saturates and drag increases significantly to simulate stalling.

### 2b. Mast Drag & Ventilation
To increase realism, the simulation accounts for the mast's drag and surface effects.

- **Mast Drag:** Calculated based on the submerged length of the mast at each time step.
- **Ventilation:** If the wing approaches or breaches the surface ($z > 0$), the lift coefficient is penalized to simulate air entrainment (ventilation), preventing the rider from generating power above the water.

### 3. Dynamics (Two-Mass Model)
To simulate high-frequency pumping accurately, the system is split into a **Fixed Mass** (Torso) and a **Moving Mass** (Legs + Board). This prevents the "zero power" error seen in single-point mass models when acceleration exceeds gravity.

- **Moving Mass ($m_{moving}$):**
  $$m_{moving} = m_{board} + (m_{rider} \times \text{SwingRatio})$$
  *(Default SwingRatio is 0.4, representing the active mass of the legs)*
- **Inertial Requirement:**
  The force required to accelerate the legs and board:
  $$F_{inertia} = m_{moving} (g + a_z)$$
- **Hydrodynamic Added Mass:**
  Accelerating the wing moves a volume of water with it. This "virtual mass" is added to the inertial requirement. It is scaled by $\cos^2(\theta)$ because added mass acts perpendicular to the wing surface.
  $$m_{added} = \rho \pi (c/2)^2 b \cos^2(\theta)$$
- **Rider Force ($F_{rider}$):**
  The rider must push down to bridge the gap between the Water Force and the Inertial Force.
  $$F_{req} = F_{hydro\_z} - F_{inertia} - m_{added} a_z$$
  $$F_{rider} = \max(0, F_{req})$$
  *(Clamped to 0 to simulate unstrapped riding—the rider cannot pull the board up).*

### 3b. Stabilizer & Pitching Moment
The simulation now includes a rear stabilizer and calculates the torque (Pitching Moment) the rider must manage.

- **Stabilizer Aerodynamics:**
  - Calculates local Angle of Attack including **Downwash** ($\epsilon$) from the front wing.
  - Generates Lift ($L_{stab}$) and Drag ($D_{stab}$).
- **Moment Summation (at Center of Lift):**
  - **Stabilizer Moment:** $M_{stab} = -L_{stab} \times \text{FuselageLength}$
  - **Damping Moment:** Resists rotation, calculated from stabilizer geometry and angular velocity.
  - **Rider Offset Moment:** Torque created if the rider stands forward or aft of the Center of Lift.
  - **Total Moment:** $M_{total} = M_{stab} + M_{damp} + M_{rider}$

### 4. Power Calculation
Power is the sum of Linear Power (legs pushing down) and Rotational Power (core/ankles fighting torque).

- **Linear Power:** $P_{linear} = \max(0, F_{rider} \times v_{ext})$
- **Rotational Power:** $P_{rot} = |M_{total} \times \omega_{pitch}|$
  *(Absolute value is used because muscles consume energy to resist torque even during eccentric loading).*
- **Total Power:** $P_{total} = P_{linear} + P_{rot}$

### 5. Power Metrics (Normalized vs Average)
- **Average Power:** The arithmetic mean of the power output ($P_{avg} = \frac{1}{N} \sum P$). It represents the total physical work done.
- **Normalized Power:** A weighted average that emphasizes high-intensity spikes. Since physiological fatigue increases non-linearly with intensity, this metric better represents the metabolic "cost" of the session.
  $$P_{norm} = \sqrt[4]{\frac{1}{N} \sum P^4}$$

## Model Limitations

### 1. Aerodynamic Limitations
- **Simplified Drag Model:** Drag is calculated using a simple parabolic polar ($C_D = C_{D0} + k C_L^2$). While mast drag is included, interference drag between components is ignored.

### 2. Biomechanical Limitations
- **Infinite Muscle Strength:** The rider is modeled as an ideal force generator. The simulation might say "Requires 1200 Watts," but it doesn't know that a human cannot generate 1200 Watts. It does not implement Hill's Muscle Equation (the trade-off between force and speed).
- **Perfectly Rigid Transmission:** The "Two-Mass Model" assumes the board and legs move as one solid unit relative to the water forces. It ignores the flex of the mast and the fuselage, which can dampen energy transfer.
- **Forced Kinematics (The "Rail" Effect):** The motion is defined by math ($z = A \cos(\omega t)$), not by forces. The board is essentially moving on a predefined invisible rail.
  - *Consequence:* If the rider stops pedaling (power = 0), the simulation doesn't show the board slowing down or sinking; it just shows "Rider Force = 0". The board never "crashes."

### 3. Mathematical Simplifications
- **Quasi-Steady Assumption:** The solver calculates forces based only on the current instant's velocity and angle. It ignores "unsteady aerodynamics" (Theodorsen effects/Wagner function), where the wake from the previous stroke affects the current lift. This is usually acceptable for low frequencies but becomes inaccurate above ~2-3 Hz.