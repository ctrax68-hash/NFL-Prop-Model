import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 pt-6">
      <h1 className="display text-[28px] font-black text-[var(--ink)]">
        Sign in
      </h1>
      <LoginForm />
    </div>
  );
}
