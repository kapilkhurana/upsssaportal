# Sample school dataset (pilot)

**File:** `up_schools_sample_named.csv`
**Rows:** 9,112 schools
**Source:** UDISE+ 2024-25 detailed master for Uttar Pradesh, anonymised. Schools are keyed on `pseudocode` (it stands in for the UDISE code).

The enrolment, facilities, location (village / ward / block / district), and pincode fields are real.

`school_name` (column 2) is synthetic: a fabricated but plausible name, generated from each school's management, level, medium, gender, and locality. These are NOT the real registered names. Do not surface them on the live public portal as official records.

Because the data carries no per-row synthetic marker, the "sample data, not official records" notice on the public portal must be driven by an app-level pilot-mode flag (an env var or config constant), shown on all public school pages until real, verified names are in place.

**Coverage:** five districts in full (Gautam Buddha Nagar, Ghaziabad, Chitrakoot, Mahoba, Shrawasti), plus a few schools of every management type drawn from other districts, so all 17 management categories appear. The five full districts have complete block and district rosters; the other districts contribute only a handful of rare-management schools.

**Determinism:** names are keyed on `pseudocode`, so re-seeding the database never churns them.

The full 262,358-row state file is intentionally excluded from the repo. It exceeds GitHub's file-size limit and is heavy for a pilot database.
