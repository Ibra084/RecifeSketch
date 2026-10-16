import type { Metadata } from "next"
import { AuthCard } from "@/components/auth/auth-card"
import { LegalDoc } from "@/components/auth/legal-doc"

export const metadata: Metadata = { title: "Terms · Recife Sketch" }

export default function TermsPage() {
  return (
    <AuthCard className="max-w-[640px] sm:px-9">
      <LegalDoc title="Terms of use">
        <h2>Using Recife Sketch</h2>
        <p>
          Recife Sketch is a study tool. The AI tutor explains topics by drawing on your whiteboard. It can make
          mistakes, so check important answers with your teacher or textbook.
        </p>
        <h2>Your account</h2>
        <ul>
          <li>Keep your password private. Don&apos;t share your account.</li>
          <li>Sign up with a personal email address. School email addresses can&apos;t be used.</li>
          <li>
            If your school gave you a student alias, your school manages that account and can reset its password.
          </li>
          <li>If you are under 18, a parent or guardian should know you are using Recife Sketch.</li>
        </ul>
        <h2>Be kind and honest</h2>
        <p>
          Don&apos;t use Recife Sketch to create anything harmful, hurtful or that breaks your school&apos;s rules,
          and don&apos;t try to break or overload the service.
        </p>
        <h2>Your whiteboards</h2>
        <p>
          What you draw and write belongs to you. You can delete any whiteboard, or your whole account, from your
          dashboard and settings.
        </p>
      </LegalDoc>
    </AuthCard>
  )
}
