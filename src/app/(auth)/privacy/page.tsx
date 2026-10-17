import type { Metadata } from "next"
import { AuthCard } from "@/components/auth/auth-card"
import { LegalDoc } from "@/components/auth/legal-doc"

export const metadata: Metadata = { title: "Privacy · Recife Sketch" }

export default function PrivacyPage() {
  return (
    <AuthCard className="max-w-[640px] sm:px-9">
      <LegalDoc title="Privacy policy">
        <h2>What we collect, and what we don&apos;t</h2>
        <ul>
          <li>
            <strong>Personal accounts:</strong> your email address and a securely hashed password. We never ask for
            your real name, age, school or photo.
          </li>
          <li>
            <strong>Student alias accounts:</strong> only the alias your school chose and a hashed password. No email
            address at all.
          </li>
          <li>
            <strong>Your whiteboards:</strong> the drawings, text and questions on boards you save, so you can come
            back to them.
          </li>
        </ul>
        <h2>How it&apos;s used</h2>
        <p>
          Only to run Recife Sketch: signing you in, saving your boards, and sending what&apos;s on your board to our
          AI provider when you ask the tutor a question. We don&apos;t sell data, show ads, or build profiles.
        </p>
        <h2>Who can see it</h2>
        <p>
          Your whiteboards are private to your account. Our database blocks every other account from reading them.
        </p>
        <h2>Deleting your data</h2>
        <p>
          Delete a whiteboard from your dashboard at any time. Personal accounts can delete everything from
          Settings → Delete account. For alias accounts, ask your school.
        </p>
      </LegalDoc>
    </AuthCard>
  )
}
