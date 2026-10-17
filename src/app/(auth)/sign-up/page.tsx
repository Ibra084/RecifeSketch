import type { Metadata } from "next"
import { AuthCard, AuthFootnote, AuthHeading, AuthTabs, TextLink } from "@/components/auth/auth-card"
import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata: Metadata = { title: "Create account · Recife Sketch" }

export default function SignUpPage() {
  return (
    <AuthCard>
      <AuthTabs active="sign-up" />
      <AuthHeading
        title="Start sketching"
        subtitle="Ask a question and watch Recife teach it on your whiteboard."
      />
      <SignUpForm />
      <AuthFootnote>
        Your school gave you an alias? <TextLink href="/alias">Use it here</TextLink>
      </AuthFootnote>
    </AuthCard>
  )
}
