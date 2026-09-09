# Security policy

This is an early platform foundation, not a production game service. Only the
current default branch is maintained at this stage; no stable SDK compatibility
promise has been published.

Use GitHub's private vulnerability reporting on this repository for sensitive
reports. Include affected revision, impact and a minimal reproduction without
real player data or credentials. Do not disclose exploitable details in public
issues. Response-time and supported-release commitments will be published before
production rollout.

Game packages are untrusted inputs. Schema validity, creator identity and review
status do not grant capabilities. Future runtime hosts must enforce origin,
storage, input and network boundaries independently. Account credentials and
authorization remain in trusted host/service code.

Repository checks catch selected credential patterns and private paths; they
are not a complete secret scanner or security assessment. Dependency auditing
is likewise one check, not proof that a package is safe. All game distributions
need their own source, asset, runtime and release review.
