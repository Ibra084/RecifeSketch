import type { AIProvider, TeachingPlanRequest, TeachingPlanResult } from "./provider"

/** A scripted `AIProvider` for tests - no network, fully deterministic. */
export class FakeAIProvider implements AIProvider {
  /** Every question this provider was called with, in order. */
  public readonly calls: string[] = []
  /** Every full request (including context) this provider was called with, in order. */
  public readonly requests: TeachingPlanRequest[] = []

  constructor(
    private readonly result: TeachingPlanResult | ((request: TeachingPlanRequest) => TeachingPlanResult)
  ) {}

  async generateTeachingPlan(request: TeachingPlanRequest): Promise<TeachingPlanResult> {
    this.calls.push(request.question)
    this.requests.push(request)
    return typeof this.result === "function" ? this.result(request) : this.result
  }
}
