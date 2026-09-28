/**
 * Store de règles FICTIF en mémoire pour la recette C04. Il héberge les versions
 * publiées, les acceptations et les échéances matérialisées d'un cycle, et
 * délègue TOUTE décision aux fonctions pures de `@kombe/domain` (`rules.ts`).
 * Comme les stores C00–C03, il ne prétend NI persister, NI verrouiller, NI
 * isoler : la preuve base réelle (immuabilité de `rule_version`, unicité
 * d'acceptation, hash exact) est le contrat `0005_rules_engine.sql` et reste
 * **BLOCKED** sans PostgreSQL. Horloge injectée (`setNow`, en millisecondes).
 */
import {
  DomainError,
  compileRuleSet,
  publishRule,
  acceptRuleVersion,
  planRuleChange,
  newRuleEffective,
  assertNonRetroactive,
  requestPenaltyEnabled,
  type PublishedRule,
  type RuleSet,
  type RuleAcceptance,
  type ExistingDue,
} from "@kombe/domain";

interface GroupRules {
  versions: PublishedRule[];
  dues: ExistingDue[];
}

export class FictitiousRulesStore {
  private readonly groups = new Map<string, GroupRules>();
  private readonly acceptances: RuleAcceptance[] = [];
  private pilot = true;
  private nowMs = 1_700_000_000_000;

  setPilot(value: boolean): void {
    this.pilot = value;
  }
  setNow(nowMs: number): void {
    this.nowMs = nowMs;
  }

  private ensure(groupId: string): GroupRules {
    let g = this.groups.get(groupId);
    if (!g) {
      g = { versions: [], dues: [] };
      this.groups.set(groupId, g);
    }
    return g;
  }

  seedDues(groupId: string, dues: readonly ExistingDue[]): void {
    this.ensure(groupId).dues = [...dues];
  }

  /** Publie une version (compiler pour le pilote → pénalités forcées à false). */
  publish(groupId: string, snapshot: RuleSet, supersedes?: number): PublishedRule {
    const g = this.ensure(groupId);
    const compiled = compileRuleSet(snapshot, { pilot: this.pilot });
    const version = (g.versions.at(-1)?.version ?? 0) + 1;
    const pub = publishRule({
      version,
      groupId,
      snapshot: compiled,
      publishedAt: this.nowMs,
      supersedes: supersedes ?? null,
    });
    g.versions.push(pub);
    return pub;
  }

  current(groupId: string): PublishedRule | undefined {
    return this.groups.get(groupId)?.versions.at(-1);
  }

  private findVersion(groupId: string, version: number): PublishedRule {
    const pub = this.groups.get(groupId)?.versions.find((v) => v.version === version);
    if (!pub) throw new DomainError("RESERVATION_INCOHERENTE", "Version de règle introuvable");
    return pub;
  }

  /** Acceptation horodatée portant sur le hash EXACT d'une version publiée. */
  accept(groupId: string, identityId: string, version: number, hash: string): RuleAcceptance {
    const pub = this.findVersion(groupId, version);
    const acceptance = acceptRuleVersion(pub, identityId, hash, this.nowMs);
    this.acceptances.push(acceptance);
    return acceptance;
  }

  /**
   * Évalue l'effectivité d'un changement de règle déjà publié (3.7) : compare la
   * version cible à la version qu'elle remplace, calcule le plan d'application,
   * puis décide si la nouvelle règle est exécutée à partir des acceptations
   * enregistrées. Un engagement essentiel non accepté par TOUTES les personnes
   * concernées ⇒ `new_rule_executed = false` (C04-ACCEPT) ; la règle courante
   * reste en vigueur.
   */
  evaluateChange(
    groupId: string,
    newVersion: number,
    concerned: readonly string[],
  ): {
    version: number;
    essential: boolean;
    appliesTo: "next_cycle" | "immediate";
    new_rule_executed: boolean;
  } {
    const g = this.groups.get(groupId);
    if (!g) throw new DomainError("RESERVATION_INCOHERENTE", "Groupe absent");
    const idx = g.versions.findIndex((v) => v.version === newVersion);
    if (idx < 1) throw new DomainError("RESERVATION_INCOHERENTE", "Version cible inexistante");
    const next = g.versions[idx] as PublishedRule;
    const prev = g.versions[idx - 1] as PublishedRule;
    const plan = planRuleChange(prev.snapshot, next.snapshot);
    const executed = newRuleEffective(plan, this.acceptances, newVersion, concerned);
    return {
      version: newVersion,
      essential: plan.essential,
      appliesTo: plan.appliesTo,
      new_rule_executed: executed,
    };
  }

  /**
   * Tente de recalculer les échéances du cycle COURANT vers la contribution de
   * la version courante (C04-RETRO). Toute modification d'une échéance déjà
   * passée lève `RULE_RETROACTIVE` ; en cas de succès, aucune échéance passée
   * n'a changé ⇒ `past_due_changed = false`.
   */
  recalculateCurrentCycle(groupId: string): { past_due_changed: false } {
    const g = this.groups.get(groupId);
    const cur = this.current(groupId);
    if (!g || !cur) throw new DomainError("RESERVATION_INCOHERENTE", "Groupe ou règle absent");
    const before = g.dues;
    const after = before.map((d) => ({ ...d, amount: cur.snapshot.contribution }));
    assertNonRetroactive(before, after, this.nowMs); // refus explicite si une échéance passée change
    g.dues = after;
    return { past_due_changed: false };
  }

  /** Demande d'activation des pénalités — barrière serveur du pilote. */
  requestPenalty(desired: boolean): {
    requested: boolean;
    penalty_enabled: boolean;
    rejected: boolean;
  } {
    return requestPenaltyEnabled(desired, this.pilot);
  }
}
