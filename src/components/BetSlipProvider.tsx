"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { PropType, Side } from "@/lib/engine/types";

export interface SlipLeg {
  propId: string;
  season: number;
  week: number;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string;
  propType: PropType;
  lineValue: number;
  side: Side;
  oddsAmerican: number;
  modelProb: number;
  fairProb: number;
  edge: number;
  /** Kelly-recommended stake in units; the user may override. */
  suggestedUnits: number;
  units: number;
}

interface BetSlipValue {
  legs: SlipLeg[];
  bankroll: number;
  isHydrated: boolean;
  add(leg: SlipLeg): void;
  remove(propId: string, side: Side): void;
  toggle(leg: SlipLeg): void;
  setUnits(propId: string, side: Side, units: number): void;
  clear(): void;
  setBankroll(value: number): void;
  has(propId: string, side: Side): boolean;
  totalUnits: number;
}

const BetSlipContext = createContext<BetSlipValue | null>(null);

const STORAGE_KEY = "nfl-prop-model.slip.v1";
const BANKROLL_KEY = "nfl-prop-model.bankroll.v1";

export function BetSlipProvider({
  children,
  defaultBankroll = 10000,
}: {
  children: ReactNode;
  defaultBankroll?: number;
}) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [bankroll, setBankrollState] = useState(defaultBankroll);
  // The slip lives in localStorage, which is unavailable during SSR. Render the
  // empty slip on the server and fill it in after mount so markup matches.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLegs(JSON.parse(raw) as SlipLeg[]);
      const storedBankroll = window.localStorage.getItem(BANKROLL_KEY);
      if (storedBankroll) setBankrollState(Number(storedBankroll));
    } catch {
      // A corrupt slip is not worth breaking the page over.
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
  }, [legs, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(BANKROLL_KEY, String(bankroll));
  }, [bankroll, isHydrated]);

  const key = (propId: string, side: Side) => `${propId}|${side}`;

  const has = useCallback(
    (propId: string, side: Side) =>
      legs.some((leg) => key(leg.propId, leg.side) === key(propId, side)),
    [legs],
  );

  const add = useCallback((leg: SlipLeg) => {
    setLegs((current) => {
      // Selecting the other side of a prop replaces it — you cannot hold both.
      const withoutProp = current.filter((l) => l.propId !== leg.propId);
      return [...withoutProp, leg];
    });
  }, []);

  const remove = useCallback((propId: string, side: Side) => {
    setLegs((current) =>
      current.filter((leg) => key(leg.propId, leg.side) !== key(propId, side)),
    );
  }, []);

  const toggle = useCallback(
    (leg: SlipLeg) => {
      if (has(leg.propId, leg.side)) remove(leg.propId, leg.side);
      else add(leg);
    },
    [add, has, remove],
  );

  const setUnits = useCallback(
    (propId: string, side: Side, units: number) => {
      setLegs((current) =>
        current.map((leg) =>
          key(leg.propId, leg.side) === key(propId, side)
            ? { ...leg, units: Math.max(0, units) }
            : leg,
        ),
      );
    },
    [],
  );

  const clear = useCallback(() => setLegs([]), []);

  const setBankroll = useCallback((value: number) => {
    setBankrollState(Math.max(0, value));
  }, []);

  const totalUnits = useMemo(
    () => legs.reduce((sum, leg) => sum + leg.units, 0),
    [legs],
  );

  const value = useMemo<BetSlipValue>(
    () => ({
      legs,
      bankroll,
      isHydrated,
      add,
      remove,
      toggle,
      setUnits,
      clear,
      setBankroll,
      has,
      totalUnits,
    }),
    [
      legs,
      bankroll,
      isHydrated,
      add,
      remove,
      toggle,
      setUnits,
      clear,
      setBankroll,
      has,
      totalUnits,
    ],
  );

  return (
    <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>
  );
}

export function useBetSlip(): BetSlipValue {
  const context = useContext(BetSlipContext);
  if (!context) {
    throw new Error("useBetSlip must be used inside a BetSlipProvider");
  }
  return context;
}
