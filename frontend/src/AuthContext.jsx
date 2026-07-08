import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth"
import { doc, getDoc, setDoc, updateDoc, increment, collection, query, where, getDocs, orderBy } from "firebase/firestore"
import { auth, db, googleProvider } from "./firebase"

const AuthContext = createContext(null)
const FREE_LIMIT = 5

const monthKey = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const ensureUserDoc = useCallback(async (firebaseUser) => {
    const ref = doc(db, "users", firebaseUser.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        photo: firebaseUser.photoURL,
        plan: "free",
        created_at: new Date().toISOString(),
        runs_this_month: 0,
        month_key: monthKey(),
      })
      return
    }

    const data = snap.data()
    if (data.month_key !== monthKey()) {
      await updateDoc(ref, { runs_this_month: 0, month_key: monthKey() })
    }
  }, [])

  const fetchUserData = useCallback(async (uid) => {
    const snap = await getDoc(doc(db, "users", uid))
    return snap.exists() ? snap.data() : null
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        await ensureUserDoc(firebaseUser)
        const data = await fetchUserData(firebaseUser.uid)
        setUserData(data)
      } else {
        setUser(null)
        setUserData(null)
      }
      setAuthLoading(false)
    })
    return unsub
  }, [ensureUserDoc, fetchUserData])

  const login = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const logout = async () => {
    await signOut(auth)
  }

  const refreshUserData = useCallback(async () => {
    if (!user) return
    const data = await fetchUserData(user.uid)
    setUserData(data)
  }, [fetchUserData, user])

  const authHeaders = useCallback(async () => {
    if (!user) throw new Error("You must sign in before making requests.")
    const token = await user.getIdToken()
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
  }, [user])

  const canRun = () => {
    if (!userData) return true
    if (userData.plan === "paid") return true
    return (userData.runs_this_month || 0) < FREE_LIMIT
  }

  const runsLeft = () => {
    if (!userData) return FREE_LIMIT
    if (userData.plan === "paid") return Infinity
    return Math.max(0, FREE_LIMIT - (userData.runs_this_month || 0))
  }

  const consumeQuotaLocally = async (count = 1) => {
    if (!user) return
    if (userData?.plan === "paid") return
    try {
      const ref = doc(db, "users", user.uid)
      await updateDoc(ref, { runs_this_month: increment(count) })
      await refreshUserData()
    } catch (err) {
      console.warn("Failed to consume quota locally:", err)
    }
  }

  const saveRunLocally = async (runData) => {
    if (!user) return
    try {
      const runId = runData.run_id || runData.id || Math.random().toString(36).substr(2, 9)
      const ref = doc(db, "runs", `${user.uid}_${runId}`)
      await setDoc(ref, {
        ...runData,
        uid: user.uid,
        timestamp: new Date().toISOString()
      })
    } catch (err) {
      console.warn("Failed to save run locally:", err)
    }
  }

  const fetchRunsLocally = async () => {
    if (!user) return []
    try {
      const q = query(collection(db, "runs"), where("uid", "==", user.uid), orderBy("timestamp", "desc"))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data())
    } catch (err) {
      console.warn("Failed to fetch runs from Firestore locally:", err)
      return []
    }
  }

  return (
    <AuthContext.Provider value={{ user, userData, authLoading, login, logout, canRun, runsLeft, refreshUserData, authHeaders, consumeQuotaLocally, saveRunLocally, fetchRunsLocally }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
