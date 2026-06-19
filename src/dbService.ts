import { collection, doc, writeBatch, getDocs, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { AgentRecord, LedgerEvent, IncidentRecord, BillingUsage, AuditReminder } from "./types";
import { DEMO_AGENT_ALPHA, DEMO_AGENT_BETA, DEMO_AGENT_SENTINEL, generateDemoLedger, DEMO_INCIDENTS } from "./data";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Collection references
const AGENTS_COLL = "pgl_agents";
const LEDGER_COLL = "pgl_ledger_events";
const INCIDENTS_COLL = "pgl_incidents";
const CONFIG_COLL = "pgl_config";
const REMINDERS_COLL = "pgl_reminders";

export async function bootstrapDatabaseIfEmpty(): Promise<{
  agents: AgentRecord[];
  events: LedgerEvent[];
  incidents: IncidentRecord[];
  billing: BillingUsage;
}> {
  try {
    // 1. Fetch Agents
    let agentsSnap;
    try {
      agentsSnap = await getDocs(collection(db, AGENTS_COLL));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, AGENTS_COLL);
      throw err;
    }
    
    // Default billing structure
    const defaultBilling: BillingUsage = {
      tier: "launch",
      active_agents: 3,
      agent_limit: 25,
      ledger_storage_mb: 2.15,
      storage_limit_mb: 10000, // 10 GB limit
      lineage_renders: 48,
      renders_limit: 500,
      price_monthly: 749,
      overage_agent_fee: 30
    };

    if (!agentsSnap.empty) {
      // Data exists in Firestore! Load it.
      const agents: AgentRecord[] = [];
      agentsSnap.forEach((doc) => {
        agents.push(doc.data() as AgentRecord);
      });

      let eventsSnap;
      try {
        eventsSnap = await getDocs(collection(db, LEDGER_COLL));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, LEDGER_COLL);
        throw err;
      }
      
      const events: LedgerEvent[] = [];
      eventsSnap.forEach((doc) => {
        events.push(doc.data() as LedgerEvent);
      });

      let incidentsSnap;
      try {
        incidentsSnap = await getDocs(collection(db, INCIDENTS_COLL));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, INCIDENTS_COLL);
        throw err;
      }
      
      const incidents: IncidentRecord[] = [];
      incidentsSnap.forEach((doc) => {
        incidents.push(doc.data() as IncidentRecord);
      });

      // Get or save billing
      let billing = defaultBilling;
      try {
        const billingSnap = await getDocs(collection(db, CONFIG_COLL));
        if (!billingSnap.empty) {
          billing = billingSnap.docs[0].data() as BillingUsage;
        } else {
          try {
            await setDoc(doc(db, CONFIG_COLL, "billing"), defaultBilling);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `${CONFIG_COLL}/billing`);
          }
        }
      } catch (e) {
        console.warn("Could not load billing config from firestore:", e);
      }

      // Sort by timestamps to keep structures neat
      agents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      incidents.sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime());

      return { agents, events, incidents, billing };
    } else {
      // Firestore is empty. Let's batch seed our magnificent demo data for instant client experience!
      const initialAgents = [DEMO_AGENT_ALPHA, DEMO_AGENT_BETA, DEMO_AGENT_SENTINEL];
      const initialEvents = generateDemoLedger();
      const initialIncidents = DEMO_INCIDENTS;

      // Seed Agents
      for (const agent of initialAgents) {
        try {
          await setDoc(doc(db, AGENTS_COLL, agent.id), agent);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `${AGENTS_COLL}/${agent.id}`);
        }
      }

      // Seed Ledger Events
      for (const ev of initialEvents) {
        try {
          await setDoc(doc(db, LEDGER_COLL, ev.id), ev);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `${LEDGER_COLL}/${ev.id}`);
        }
      }

      // Seed Incidents
      for (const inc of initialIncidents) {
        try {
          await setDoc(doc(db, INCIDENTS_COLL, inc.id), inc);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `${INCIDENTS_COLL}/${inc.id}`);
        }
      }

      // Seed Billing Config
      try {
        await setDoc(doc(db, CONFIG_COLL, "billing"), defaultBilling);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${CONFIG_COLL}/billing`);
      }

      return {
        agents: initialAgents,
        events: initialEvents,
        incidents: initialIncidents,
        billing: defaultBilling
      };
    }
  } catch (error) {
    console.error("Firebase connection or permission error, falling back to offline-resilient local state:", error);
    // Silent fail-safe fallback so the application ALWAYS works, even with custom local rules or sandbox limits.
    return {
      agents: [DEMO_AGENT_ALPHA, DEMO_AGENT_BETA, DEMO_AGENT_SENTINEL],
      events: generateDemoLedger(),
      incidents: DEMO_INCIDENTS,
      billing: {
        tier: "launch",
        active_agents: 3,
        agent_limit: 25,
        ledger_storage_mb: 2.15,
        storage_limit_mb: 10000,
        lineage_renders: 48,
        renders_limit: 500,
        price_monthly: 749,
        overage_agent_fee: 30
      }
    };
  }
}

// Add new Agent to Firestore
export async function saveAgentToFirestore(agent: AgentRecord): Promise<boolean> {
  try {
    await setDoc(doc(db, AGENTS_COLL, agent.id), agent);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${AGENTS_COLL}/${agent.id}`);
    return false;
  }
}

// Add new Ledger Event to Firestore
export async function saveLedgerEventToFirestore(event: LedgerEvent): Promise<boolean> {
  try {
    await setDoc(doc(db, LEDGER_COLL, event.id), event);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${LEDGER_COLL}/${event.id}`);
    return false;
  }
}

// Update Agent version in Firestore
export async function updateAgentInFirestore(agent: AgentRecord): Promise<boolean> {
  try {
    await setDoc(doc(db, AGENTS_COLL, agent.id), agent);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${AGENTS_COLL}/${agent.id}`);
    return false;
  }
}

// Add Incident to Firestore
export async function saveIncidentToFirestore(inc: IncidentRecord): Promise<boolean> {
  try {
    await setDoc(doc(db, INCIDENTS_COLL, inc.id), inc);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${INCIDENTS_COLL}/${inc.id}`);
    return false;
  }
}

// Update incident resolution details
export async function remediateIncidentInFirestore(incId: string, status: "remediated" | "investigating", notes: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, INCIDENTS_COLL, incId), {
      status,
      remediation_notes: notes
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${INCIDENTS_COLL}/${incId}`);
    return false;
  }
}

// Update billing counts
export async function updateBillingInFirestore(billing: BillingUsage): Promise<boolean> {
  try {
    await setDoc(doc(db, CONFIG_COLL, "billing"), billing);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${CONFIG_COLL}/billing`);
    return false;
  }
}

// Get all saved reminders from Firestore
export async function getRemindersFromFirestore(): Promise<AuditReminder[]> {
  try {
    const snap = await getDocs(collection(db, REMINDERS_COLL));
    const reminders: AuditReminder[] = [];
    snap.forEach((doc) => {
      reminders.push(doc.data() as AuditReminder);
    });
    return reminders;
  } catch (error) {
    console.warn("Could not load reminders from firestore, returning empty list:", error);
    return [];
  }
}

// Save a reminder to Firestore
export async function saveReminderToFirestore(reminder: AuditReminder): Promise<boolean> {
  try {
    await setDoc(doc(db, REMINDERS_COLL, reminder.id), reminder);
    return true;
  } catch (error) {
    console.warn("Could not save reminder to firestore:", error);
    return false;
  }
}

// Delete a reminder from Firestore
export async function deleteReminderFromFirestore(reminderId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, REMINDERS_COLL, reminderId));
    return true;
  } catch (error) {
    console.warn("Could not delete reminder from firestore:", error);
    return false;
  }
}

