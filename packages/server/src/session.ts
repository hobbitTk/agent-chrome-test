/**
 * Test Session Manager
 *
 * Tracks assertions and test results within named sessions.
 * Provides summary data when a session ends.
 */

export interface Assertion {
  passed: boolean;
  message: string;
  timestamp: string;
}

export interface SessionSummary {
  name: string;
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count: number;
  assertions: Assertion[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export class TestSession {
  private name: string | null = null;
  private assertions: Assertion[] = [];
  private startedAt: Date | null = null;

  get active(): boolean {
    return this.name !== null;
  }

  start(name: string): void {
    this.name = name;
    this.assertions = [];
    this.startedAt = new Date();
  }

  addAssertion(passed: boolean, message: string): void {
    this.assertions.push({
      passed,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  end(): SessionSummary {
    const endedAt = new Date();
    const passedCount = this.assertions.filter((a) => a.passed).length;
    const failedCount = this.assertions.filter((a) => !a.passed).length;

    const summary: SessionSummary = {
      name: this.name ?? 'unnamed',
      passed: failedCount === 0,
      total: this.assertions.length,
      passed_count: passedCount,
      failed_count: failedCount,
      assertions: this.assertions,
      startedAt: this.startedAt?.toISOString() ?? endedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - (this.startedAt?.getTime() ?? endedAt.getTime()),
    };

    // Reset
    this.name = null;
    this.assertions = [];
    this.startedAt = null;

    return summary;
  }
}
