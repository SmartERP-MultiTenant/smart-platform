import { type Page, type Locator, expect } from '@playwright/test';

export class JoinPage {
  private readonly nameBox: Locator;
  private readonly teamNameBox: Locator;
  private readonly emailBox: Locator;
  private readonly passwordBox: Locator;
  private readonly createAccountButton: Locator;
  private readonly createAccountSuccessMessage: string;
  constructor(
    public readonly page: Page,
    public readonly user: {
      name: string;
      email: string;
      password: string;
    },
    public readonly teamName: string
  ) {
    this.nameBox = this.page.getByPlaceholder('Your Name');
    this.teamNameBox = this.page.getByPlaceholder('Team Name');
    this.emailBox = this.page.getByPlaceholder('example@smart-platform.com');
    this.passwordBox = this.page.getByPlaceholder('Password');
    this.createAccountButton = page.getByRole('button', {
      name: 'Create Account',
    });
    this.createAccountSuccessMessage =
      'You have successfully created your account.';
  }

  async goto() {
    await this.page.goto('/auth/join');
    await expect(
      this.page.getByRole('heading', { name: 'Get started' })
    ).toBeVisible();
  }

  async signUp() {
    // Capture the signup API response so a server-side failure (e.g. a 500)
    // fails immediately with its status and body instead of timing out on the
    // waitForURL below.
    const joinResponsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/join') &&
        response.request().method() === 'POST'
    );
    await this.nameBox.fill(this.user.name);
    await this.teamNameBox.fill(this.teamName);
    await this.emailBox.fill(this.user.email);
    await this.passwordBox.fill(this.user.password);
    await this.createAccountButton.click();

    const joinResponse = await joinResponsePromise;
    const responseText = await joinResponse.text().catch(() => '');
    expect(
      joinResponse.ok(),
      `POST /api/auth/join failed with ${joinResponse.status()}: ${responseText}`
    ).toBeTruthy();

    // '**/' glob matches with or without the /en locale prefix (baseURL pin).
    await this.page.waitForURL('**/auth/login');
    await expect(
      this.page
        .getByRole('status')
        .and(this.page.getByText(this.createAccountSuccessMessage))
    ).toBeVisible();
  }
}
