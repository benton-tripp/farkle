# Calculation Method

This document describes the implemented rules and objectives. The browser evaluates the formulas numerically; it does not use simulation to estimate probabilities.

## Roll Probabilities and Scoring

Let d be the number of dice rolled and c = (c₁, …, c₆) their face counts. For fair, independent dice, the probability of that multiset is

```math
P(c)=\frac{d!}{6^d\prod_{i=1}^6 c_i!}.
```

The engine enumerates all nonnegative count vectors summing to d. The number of ordered outcomes represented by these vectors sums to 6^d. There are 462 count vectors for six dice, representing 46,656 ordered rolls.

For each roll, it enumerates every nonempty subset that can be completely scored. Each die can appear in only one scoring combination. When a subset has several valid partitions, it retains the highest score. This is an explicit modeling convention, not a claim that every Farkle rule set permits the same choices.

The exact Farkle probability is the sum of the weights of rolls with no scoring subset. The all-dice-score probability sums the weights of rolls with at least one scoring subset using every die. The latter is an opportunity, not a promise that the policy will select every die.

## State, Rewards, and Actions

The decision state is (d,t), with d dice available and t unbanked points. Banked score b, target g, entry status, and the rules are fixed during the current calculation. No combination can include dice from a previous roll.

Banking adds t points to the banked score. A Farkle changes it by −L, where L is the active streak penalty capped at b, or zero when no penalty is active. The unbanked t is lost but isn't subtracted from b. The expected-value reward therefore measures the net change from the banked score at the start of the turn.

Banking is legal only if t is positive, the entry requirement is met or was met earlier, and the forced-hot rule doesn't prohibit it. Under that rule, a six-dice continuation state must roll. A six-dice initial state at t = 0 must roll in any case.

A scoring selection a adds sₐ positive points and keeps kₐ dice. Its next dice count is

```math
d_a=6 \quad \text{if }k_a=d.
```

```math
d_a=d-k_a \quad \text{if }k_a<d.
```

All available scores are multiples of 50. The score grid is therefore exact for the supported inputs and awards, not a discretization approximation.

## Expected Points

Let V(d,t) be the maximum expected net change in banked points. With A(ω) the legal scoring selections from roll ω, define the best continuation after a scoring roll:

```math
H_V(\omega,t)=\max_{a\in A(\omega)}V(d_a,t+s_a).
```

The expected value of rolling is

```math
Q(d,t)=-L\,P(F\mid d)+\sum_{\omega\notin F}P(\omega)H_V(\omega,t).
```

```math
V(d,t)=\max\{t,Q(d,t)\},
```

with t excluded when banking is illegal. Every successful selection increases t, so the table can be filled in descending score order once its high-score values are known.

For a given number of dice kept, a higher score dominates a lower one. More initial points allow every policy feasible at the lower total, with no larger penalty and no stricter banking restriction. The solver can retain only the highest score for each kept-dice count when evaluating future rolls. The interface still shows every scoring subset.

## Target Probability and Turn Risk

For the target objective, b must be less than g. Let J(d,t) be the maximum probability of ending this turn with banked score at least g. A Farkle fails that objective.

Define B(d,t) as 1 when banking is legal and b + t reaches the target, and 0 otherwise. The probability of reaching the target by rolling is

```math
Q_g(d,t)=\sum_{\omega\notin F}P(\omega)H_J(\omega,t),
```

where

```math
H_J(\omega,t)=\max_{a\in A(\omega)}J(d_a,t+s_a).
```

The optimal target-reaching probability is

```math
J(d,t)=\max\{B(d,t),Q_g(d,t)\}.
```

When banking is illegal, B(d,t) is zero and cannot improve on the nonnegative roll probability. Expected net points break near-equal target-probability ties. Remaining ties favor lower Farkle risk, then banking. Expected values and risk estimates are calculated under that same selected policy, not under separate objectives.

For a selected policy π, eventual turn-Farkle risk is zero on banking. On rolling,

```math
R_\pi(d,t)=P(F\mid d)+\sum_{\omega\notin F}P(\omega)R_\pi(d_{a_\pi},t+s_{a_\pi}).
```

In expected-points mode, the displayed target probability refers to the banked total at turn end, even if b already meets the target. A Farkle then counts as target success only when b − L remains at or above g. Reaching that total still says nothing about opponents' final turns.

## A Valid High-Score Boundary

An arbitrary score cap that forces a bank can violate the rules and change the solution. The engine instead derives a region where the optimal actions and their values are known.

Let p_d = P(F | d). Let A_d be the expected maximum immediate score from a roll of d dice, assigning zero to Farkles. Choose

```math
C\geq\max_{d=1,\ldots,6}\frac{A_d}{p_d}.
```

Starting with t at least C, one further roll changes the expected unbanked amount by at most

```math
A_d-p_dt-p_dL\leq0.
```

On every successful roll, t increases, so the inequality remains true. All dice counts have a positive Farkle probability. The number of rolls before stopping or Farkling is bounded in expectation by a geometric waiting time, and the points gained on any one roll are bounded. Consequently, continued play cannot have expected terminal reward greater than t. Wherever banking is legal, banking is optimal in this region.

The implemented boundary is also at least the entry requirement when applicable, and at least g − b. The latter ensures that a bank in the boundary region reaches the target, which is needed when calculating target probabilities. These bounds are rounded upward to the 50-point grid with a small positive margin to avoid a floating-point boundary tie.

### Forced Hot Dice

With compulsory hot-dice rerolls, banking at d = 6 remains illegal regardless of score. In the high-score region, classify six-dice outcomes as:

- Farkles, with total probability p.
- Successful rolls with at least one proper scoring subset, with probability q. Let sₚ(ω) be the largest score from a proper subset.
- Successful rolls whose only scoring selection uses all six dice, with probability h. Let sₕ(ω) be that selection's score.

Here p + q + h = 1. A proper subset leaves one through five dice and permits banking once the entry requirement is satisfied. Define the unconditional weighted score sums

```math
C_p=\sum_{\omega\in\mathcal P}P(\omega)s_p(\omega).
```

```math
C_h=\sum_{\omega\in\mathcal H}P(\omega)s_h(\omega).
```

Consider the policy that banks the best proper subset whenever possible and otherwise takes the full scoring selection and rolls six again. Its value is affine:

```math
W(t)=at+c.
```

```math
a=\frac{q}{1-h},\qquad c=\frac{C_p+aC_h-pL}{1-h}.
```

This follows by substituting W into

```math
W(t)=qt+C_p+\sum_{\omega\in\mathcal H}P(\omega)W(t+s_h(\omega))-pL.
```

Its eventual Farkle probability is p/(1 − h), and its probability of banking is a = 1 − p/(1 − h).

For expected-points optimization, a roll offering both a proper subset and a full selection must prefer the proper subset for W to be the optimal boundary value. If s_f is the full selection's score, that condition is

```math
t+s_p\geq a(t+s_f)+c.
```

Let $\mathcal B$ be the set of outcomes offering both choices. The engine therefore also requires

```math
T\geq\max_{\omega\in\mathcal B}\frac{a s_f(\omega)+c-s_p(\omega)}{1-a},
```

in addition to the earlier bounds. For every t at least T, W satisfies the six-dice Bellman equation. Taking a proper subset attains its bank value; a full selection cannot improve on it where both are available. Full-only outcomes continue within the same region. The probability of continued play decays geometrically, while scores grow at most linearly with roll count, so no residual value remains at infinite depth.

For target-probability optimization, every legal bank in this region succeeds with probability 1. Taking a full selection and being forced to roll again succeeds with probability a, which is less than 1. The proper subset is therefore preferred without the additional expected-value threshold. The same affine W gives the expected points of that target-optimal boundary policy.

This treatment avoids an artificial bank at the boundary. Increasing a valid boundary should leave values below it unchanged apart from floating-point error; the tests check that property.

## Numerical and Model Limits

The counts of ordered outcomes are exact integers. Weighted expectations, boundary coefficients, and policy values use JavaScript floating-point numbers. Comparisons within 16 machine epsilons of the larger magnitude are treated as ties. This tolerance is relative even for very small target probabilities.

The state includes only the current turn. Prior Farkles affect its reward only through an active penalty. Their effect on possible penalties during later turns is outside this objective. Opponents, exact-score rules, final rounds, and uncertain dice probabilities are not modeled.

The mathematical claim is optimality for the stated one-turn model, evaluated numerically. It is not a claim of optimal multiplayer play or of exact rational arithmetic in the implementation.
