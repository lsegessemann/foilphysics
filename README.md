## Physics Model

The simulation uses a custom quasi-steady solver that iterates through time steps ($dt$) to calculate forces and rider power.

### 1. Kinematics (Motion)
The rider's vertical motion (**Heave**) and the board's angle (**Pitch**) are driven by sinusoidal functions, linked by a configurable **Phase Shift**.

- **Frequency:** $\omega = 2\pi f$
- **Vertical Position ($z$):** $z(t) = A \cos(\omega t)$
- **Vertical Velocity ($v_z$):** $v_z(t) = -A \omega \sin(\omega t)$
- **Vertical Acceleration ($a_z$):** $a_z(t) = -A \omega^2 \cos(\omega t)$
- **Pitch Angle ($\theta$):** $\theta(t) = \theta_{trim} + \theta_{amp} \cos(\omega t + \phi)$
  *(Where $\phi$ is the Phase Shift)*

### 2. Aerodynamics (Fluid Forces)
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