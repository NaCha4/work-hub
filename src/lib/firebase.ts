import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

/** .env 가 아직 안 채워졌을 때 흰 화면 대신 안내를 띄우기 위한 플래그. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

const app = initializeApp(
  firebaseConfigured ? config : { apiKey: 'demo', projectId: 'demo' },
)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

/** 발표 중 덧칠을 나르는 통로. 주소가 비면 그 기능만 꺼진다. */
export const liveConfigured = firebaseConfigured && Boolean(config.databaseURL)
// getDatabase 는 주소가 없으면 던진다. 켜져 있을 때만 만든다.
export const rtdb = liveConfigured ? getDatabase(app) : null

// prompt: 'select_account' 를 붙이지 않는다. 그걸 주면 이미 크롬에 로그인된
// 계정이 있어도 매번 계정 선택 화면이 뜬다. 빼두면 브라우저에 로그인된 계정이
// 하나일 때 곧바로 통과하고, 여러 개일 때만 구글이 선택 화면을 띄운다.
// 로그인 상태 자체는 Firebase 가 기본값(browserLocalPersistence)으로
// IndexedDB 에 저장하므로 브라우저를 껐다 켜도 유지된다.
