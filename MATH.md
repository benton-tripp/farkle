# Calculation Method

This document describes the implemented rules and objectives. The browser evaluates the formulas numerically; it does not use simulation to estimate probabilities.

## Roll Probabilities and Scoring

Let $d$ be the number of dice rolled, from 1 to 6. Let $\mathbf c=(c_1,\ldots,c_6)$ be the face-count vector, where $c_i$ is the number of dice showing face $i$. All $c_i$ are nonnegative integers and $\sum_{i=1}^6 c_i=d$. The notation $P(\mathbf c)$ means the probability of observing those face counts in any order. With fair, independent dice, this probability is

```math
P(\mathbf c)=\frac{d!}{6^d\prod_{i=1}^6 c_i!}.
```

Here $d!$ means the factorial of $d$, and $\prod_{i=1}^6 c_i!$ means the product of the six count factorials. Their ratio counts the distinct orders of the given faces. The denominator $6^d$ is the total number of equally likely ordered rolls. The engine enumerates 462 distinct face-count vectors for six dice, representing 46,656 ordered rolls.

For each roll, it enumerates every nonempty subset that can be completely scored. Each die can appear in only one scoring combination. When a subset has several valid partitions, it retains the highest score. This is an explicit modeling convention, not a claim that every Farkle rule set permits the same choices.

A Farkle is a roll with no legal scoring selection. Write $F$ for that event and $P(F\mid d)$ for its probability with $d$ dice. The exact Farkle probability sums $P(\mathbf c)$ across all face-count vectors that Farkle. The all-dice-score probability instead sums outcomes containing at least one legal selection using every die. That is a scoring opportunity, not necessarily the selection the strategy recommends.

## State, Rewards, and Actions

The decision state is $(d,t)$, where $d$ is the dice count available for the next roll and $t$ is the unbanked score accumulated during the current turn. Let $b$ be the points already banked before this turn and $g$ the target game score. The entry status, $b$, $g$, and the rules remain fixed within one calculation. No scoring combination can include dice from earlier rolls.

Banking adds $t$ points to the banked score. A Farkle changes it by $-L$, where $L$ is the active consecutive-Farkle penalty, capped at $b$, or zero when the penalty rule is inactive. The unbanked $t$ is lost but is not deducted from $b$. Expected-value calculations measure the change in banked points relative to the start of this turn.

Banking is legal only if $t$ is positive, the entry requirement is met or was met earlier, and the forced-hot rule doesn't prohibit it. Under that rule, a six-dice continuation state must roll. A six-dice initial state at $t=0$ must roll in any case.

Let $a$ be a legal choice of scoring dice from the current roll. It scores $s_a$ points and uses $k_a$ dice. The next roll has $d_a$ dice: six if all $d$ dice scored (hot dice), or $d-k_a$ otherwise.

```math
d_a=6 \quad \text{if }k_a=d.
```

```math
d_a=d-k_a \quad \text{if }k_a<d.
```

All available scores are multiples of 50. The score grid is therefore exact for the supported inputs and awards, not a discretization approximation.

## Expected Points

Let $\omega$ denote a possible face-count outcome from rolling $d$ dice, and let $P(\omega)$ be its probability, including all orders of those faces. Let $F$ be the set of Farkle outcomes. For a scoring outcome $\omega$, the set $A(\omega)$ contains its legal scoring selections. Each selection $a$ yields $s_a$ points and leaves $d_a$ dice, as defined above.

Let $V(d,t)$ be the maximum expected **net change in banked points** when $d$ dice remain and $t$ points are unbanked. Define $G(\omega,t)$ as the continuation value after seeing roll $\omega$. On a Farkle it equals $-L$; otherwise the best selection determines the continuation value:

```math
G(\omega,t)=-L \quad \text{if }\omega\in F.
```

```math
G(\omega,t)=\max_{a\in A(\omega)}V(d_a,t+s_a) \quad \text{if }\omega\notin F.
```

The expected net value of **rolling now**, denoted $Q(d,t)$, averages $G$ over every possible next roll:

```math
Q(d,t)=\sum_{\omega}P(\omega)G(\omega,t).
```

Banking immediately adds $t$ points, so the best expected value is

```math
V(d,t)=\max\{t,Q(d,t)\}.
```

The bank option $t$ is omitted when banking is illegal. Every successful selection increases $t$, so the table can be filled in descending score order once its high-score values are known.

For a given number of dice kept, a higher score dominates a lower one. More initial points allow every policy feasible at the lower total, with no larger penalty and no stricter banking restriction. The solver can retain only the highest score for each kept-dice count when evaluating future rolls. The interface still shows every scoring subset.

## Target Probability and Turn Risk

This objective requires $b<g$. Let $J(d,t)$ be the greatest probability of **finishing this turn** with at least $g$ banked points, starting from $b$ banked points. Define $B_g(d,t)$ to be 1 if a legal bank would reach the target ($b+t\geq g$), and 0 if a legal bank would fall short. An illegal bank is not a candidate action.

The function $G_g(\omega,t)$ is the target-reaching probability after observing roll $\omega$. A Farkle fails this objective. On a scoring roll, the calculator chooses the legal scoring selection $a$ that maximizes the probability of success:

```math
G_g(\omega,t)=0 \quad \text{if }\omega\in F.
```

```math
G_g(\omega,t)=\max_{a\in A(\omega)}J(d_a,t+s_a) \quad \text{if }\omega\notin F.
```

Let $Q_g(d,t)$ be the probability of reaching the target by rolling next and then following the best available choices. Averaging across all possible rolls gives

```math
Q_g(d,t)=\sum_{\omega}P(\omega)G_g(\omega,t).
```

The best target-reaching probability compares banking with rolling:

```math
J(d,t)=\max\{B_g(d,t),Q_g(d,t)\}.
```

Expected net points break near-equal target-probability ties. Remaining ties favor lower Farkle risk, then banking. Expected values and risk estimates use that same selected policy, rather than separate policies for each metric.

A **policy** $\pi$ specifies whether to bank or roll at each reachable state and which scoring selection to make after each future roll. Let $R_\pi(d,t)$ be the probability of Farkling before the current turn ends when following $\pi$. It is zero if $\pi$ banks now. If $\pi$ rolls, the first term below is the chance of an immediate Farkle. In the sum, $a_\pi$ is the scoring selection made by $\pi$ after observing $\omega$; $s_{a_\pi}$ and $d_{a_\pi}$ are its points and next dice count:

```math
R_\pi(d,t)=P(F\mid d)+\sum_{\omega\notin F}P(\omega)R_\pi(d_{a_\pi},t+s_{a_\pi}).
```

In expected-points mode, the displayed target probability refers to the banked total at turn end, even if $b$ already meets the target. A Farkle then counts as target success only when $b-L$ remains at or above $g$. Reaching that total still says nothing about opponents' final turns.

## A Valid High-Score Boundary

An arbitrary score cap that forces a bank can violate the rules and change the solution. The engine instead derives a region where the optimal actions and their values are known.

Let $p_d=P(F\mid d)$ be the probability of a Farkle on $d$ dice, and let $A_d$ be the expected largest **immediate** scoring award obtainable on that roll, counting a Farkle as zero. All six values of $p_d$ are positive. Choose a threshold $C$ satisfying

```math
C\geq\max_{d=1,\ldots,6}\frac{A_d}{p_d}.
```

For any unbanked total $t\geq C$, one additional roll changes the expected terminal value by at most

```math
A_d-p_dt-p_dL\leq0.
```

On every successful roll, $t$ increases, so the inequality remains true. All dice counts have a positive Farkle probability. The number of rolls before stopping or Farkling is bounded in expectation by a geometric waiting time, and the points gained on any one roll are bounded. Consequently, continued play cannot have expected terminal reward greater than $t$. Wherever banking is legal, banking is optimal in this region.

The implemented boundary is also at least the entry requirement when applicable, and at least $g-b$. The latter ensures that a bank in the boundary region reaches the target, which is needed when calculating target probabilities. These bounds are rounded upward to the 50-point grid with a small positive margin to avoid a floating-point boundary tie.

### Forced Hot Dice

With compulsory hot-dice rerolls, banking with $d=6$ remains illegal regardless of the unbanked total $t$. Partition the possible six-dice roll outcomes into three disjoint groups:

- Farkles, with total probability $p$.
- Successful rolls with at least one proper scoring subset, with total probability $q$. Let $s_p(\omega)$ be the largest score from a proper subset of outcome $\omega$.
- Successful rolls whose only scoring selection uses all six dice, with total probability $h$. Let $s_h(\omega)$ be the score of that full selection.

Here $p+q+h=1$. Let $\mathcal P$ be the set of outcomes with a proper scoring subset, and $\mathcal H$ the set with only a full-six-dice scoring selection. A proper subset uses fewer than six dice, leaving one through five dice, and permits banking once the entry requirement is satisfied. Define the probability-weighted score sums $C_p$ and $C_h$ (unconditional contributions, not averages conditional on their groups):

```math
C_p=\sum_{\omega\in\mathcal P}P(\omega)s_p(\omega).
```

```math
C_h=\sum_{\omega\in\mathcal H}P(\omega)s_h(\omega).
```

Consider a policy that banks the highest-scoring proper subset when one exists and otherwise scores all six dice and rolls again. Let $W(t)$ be its expected net change in banked points from a forced six-dice state with $t$ unbanked points. In the high-score region, $W$ is linear in $t$, with slope $\alpha$ and intercept $\beta$:

```math
W(t)=\alpha t+\beta.
```

```math
\alpha=\frac{q}{1-h},\qquad \beta=\frac{C_p+\alpha C_h-pL}{1-h}.
```

This follows by substituting $W$ into

```math
W(t)=qt+C_p+\sum_{\omega\in\mathcal H}P(\omega)W(t+s_h(\omega))-pL.
```

The policy eventually Farkles with probability $p/(1-h)$ and successfully banks with probability $\alpha=1-p/(1-h)$. The denominator $1-h$ accounts for the chance of repeatedly rolling another full-only outcome.

For expected-points optimization, a roll offering both a proper subset and a full selection must favor the proper subset for $W$ to be the optimal boundary value. For such an outcome $\omega$, write $s_p$ for its best proper-subset score and $s_f$ for its full-selection score. The condition is

```math
t+s_p\geq \alpha(t+s_f)+\beta.
```

Let $\mathcal B$ be the set of six-dice outcomes offering both a proper scoring subset and a full-dice selection. Let $T$ be a lower bound on the unbanked total $t$ where the proper selection always dominates. The engine also requires

```math
T\geq\max_{\omega\in\mathcal B}\frac{\alpha s_f(\omega)+\beta-s_p(\omega)}{1-\alpha},
```

in addition to the earlier bounds. For every $t\geq T$, $W$ satisfies the six-dice Bellman equation. Taking a proper subset attains its bank value; a full selection cannot improve on it where both are available. Full-only outcomes continue within the same region. The probability of continued play decays geometrically, while scores grow at most linearly with roll count, so no residual value remains at infinite depth.

For target-probability optimization, every legal bank in this region succeeds with probability 1. Taking a full selection and being forced to roll again succeeds with probability $\alpha$, which is less than 1. The proper subset is therefore preferred without the additional expected-value threshold. The same affine $W$ gives the expected points of that target-optimal boundary policy.

This treatment avoids an artificial bank at the boundary. Increasing a valid boundary should leave values below it unchanged apart from floating-point error; the tests check that property.

## Numerical and Model Limits

The counts of ordered outcomes are exact integers. Weighted expectations, boundary coefficients, and policy values use JavaScript floating-point numbers. Comparisons within 16 machine epsilons of the larger magnitude are treated as ties. This tolerance is relative even for very small target probabilities.

The state includes only the current turn. Prior Farkles affect its reward only through an active penalty. Their effect on possible penalties during later turns is outside this objective. Opponents, exact-score rules, final rounds, and uncertain dice probabilities are not modeled.

The mathematical claim is optimality for the stated one-turn model, evaluated numerically. It is not a claim of optimal multiplayer play or of exact rational arithmetic in the implementation.
