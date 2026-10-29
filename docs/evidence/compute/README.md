# Compute workspace review

`passive-client.png` is a Playwright capture of the actual UI with a synthetic
backend, not a live rental or authentication receipt. Both client and host roles
have browser coverage. Rental authorization remains separate and unavailable
until the owner attachment is implemented.

Validation: production UI build, ESLint, Prettier passed; the 31-test mocked
suite passed, followed by four compute tests including the two added role cases.
No live GPU or native desktop bundle qualification is claimed.
