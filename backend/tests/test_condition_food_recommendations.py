"""
Comprehensive Automated Test Suite for Condition-Aware Food Recommendation Logic.
Covers:
- Test Group 1: Fever Regression Tests (Chicken Biryani excluded from Fever, present in general search, unreviewed mappings excluded)
- Test Group 2: Dietary Preference & Household Member Tests (vegetarian, vegan, eggetarian, non-vegetarian, unknown preference)
- Test Group 3: Other Condition Tests (category alone insufficient, NULL nutrient preservation, individualised_advice_required, allergen warnings, empty state)
"""

from pathlib import Path

from app.main import app
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import (
    ConditionFoodMapping,
    DataSource,
    FoodItem,
    HealthCondition,
)
from tests.conftest import AuthenticatedTestClient

client = AuthenticatedTestClient(app)


def test_test_suite_uses_isolated_database():
    """Verify tests are running against the isolated temporary test database, never production gharplate.db."""
    assert "gharplate_pytest_db_" in settings.DATABASE_URL
    prod_backend_db = Path(__file__).resolve().parents[1] / "gharplate.db"
    assert str(prod_backend_db) not in settings.DATABASE_URL


# ============================================================================
# TEST GROUP 1 — FEVER REGRESSION TESTS
# ============================================================================
def test_fever_returns_only_explicitly_mapped_reviewed_foods():
    """
    1. Calling /api/v1/conditions/fever_acute_recovery/foods returns only explicitly mapped,
       reviewed fever-relevant foods.
    2. Chicken Biryani is NOT returned in /api/v1/conditions/fever_acute_recovery/foods.
    """
    resp = client.get("/api/v1/conditions/fever_acute_recovery/foods")
    assert resp.status_code == 200
    data = resp.json()

    assert data["condition"]["code"] == "fever_acute_recovery"
    assert data["condition"]["is_short_term_illness"] is True

    returned_slugs = [item["slug"] for item in data["foods"]]
    returned_names = [item["name_en"] for item in data["foods"]]

    # Chicken Biryani MUST NOT appear in Fever recommendations
    assert "chicken-biryani" not in returned_slugs
    assert "Chicken Biryani" not in returned_names

    # Unreviewed mapping (packaged-salted-potato-chips) MUST NOT appear
    assert "packaged-salted-potato-chips" not in returned_slugs

    # Expected reviewed supportive fever foods MUST appear
    expected_fever_slugs = {
        "khichdi-moong-dal-rice",
        "idli-steamed-rice-lentil",
        "pongal-khara-ven-pongal",
        "rasam-tomato-pepper",
        "buttermilk-chaas",
        "curd-rice-mosaranna",
        "banana-ripe",
        "moong-dal-green-gram",
        "egg-poultry-whole",
    }
    assert set(returned_slugs) == expected_fever_slugs

    # Verify structured contract on every returned item
    for item in data["foods"]:
        assert item["review_status"] == "reviewed"
        assert item["relevance_type"] in {
            "relevant_food_to_explore",
            "portion_sensitive",
            "nutrient_to_monitor",
            "individualised_advice_required",
            "insufficient_information",
        }
        assert len(item["reason"]) >= 20
        assert isinstance(item["relevant_tags"], list)
        assert len(item["relevant_tags"]) >= 1
        assert "energy_kcal" in item["nutrition_highlights"]
        assert "is_vegetarian" in item["dietary_compatibility"]
        assert "is_vegan" in item["dietary_compatibility"]
        assert item["source"]["name"]
        assert item["source"]["year"] >= 2017


def test_chicken_biryani_remains_searchable_in_general_food_explorer():
    """
    3. Chicken Biryani remains searchable in /api/v1/foods?q=Biryani and is not deleted or
       falsely labelled medically 'unsafe' or 'forbidden'.
    """
    resp = client.get("/api/v1/foods", params={"q": "Biryani"})
    assert resp.status_code == 200
    data = resp.json()
    slugs = [item["slug"] for item in data["items"]]
    assert "chicken-biryani" in slugs

    detail_resp = client.get("/api/v1/foods/chicken-biryani")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert "Biryani" in detail["name_en"]
    assert detail["is_vegetarian"] is False


def test_unreviewed_condition_mappings_are_never_returned():
    """
    4. Unreviewed mappings are not returned by /api/v1/conditions/{code}/foods.
    """
    db = SessionLocal()
    try:
        unreviewed = (
            db.query(ConditionFoodMapping)
            .join(HealthCondition)
            .join(FoodItem)
            .filter(
                HealthCondition.code == "fever_acute_recovery",
                FoodItem.slug == "packaged-salted-potato-chips",
            )
            .first()
        )
        assert unreviewed is not None
        assert unreviewed.review_status == "unreviewed"
    finally:
        db.close()

    resp = client.get("/api/v1/conditions/fever_acute_recovery/foods")
    assert resp.status_code == 200
    slugs = [f["slug"] for f in resp.json()["foods"]]
    assert "packaged-salted-potato-chips" not in slugs


# ============================================================================
# TEST GROUP 2 — DIETARY PREFERENCE TESTS
# ============================================================================
def test_unknown_dietary_preference_does_not_assume_preference():
    """
    5. Unknown dietary preference does not assume a preference:
       member_context.personalised is False and dietary_preference is None.
    """
    resp = client.get("/api/v1/conditions/fever_acute_recovery/foods")
    assert resp.status_code == 200
    data = resp.json()
    assert data["member_context"]["member_id"] is None
    assert data["member_context"]["dietary_preference"] is None
    assert data["member_context"]["personalised"] is False

    # Without a filter, both vegetarian foods (khichdi) and egg (egg-poultry-whole) are returned with clear badges
    slugs = [f["slug"] for f in data["foods"]]
    assert "khichdi-moong-dal-rice" in slugs
    assert "egg-poultry-whole" in slugs


def test_vegetarian_member_excludes_egg_meat_and_fish():
    """
    1. A vegetarian household member does not receive egg, meat, poultry, or fish foods.
    """
    client.ensure_authenticated()
    token = client.household_token
    client.post("/api/v1/households", json={"household_token": token, "name": "Veg Test Household"})
    mem = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Kavitha",
            "age_group": "adult",
            "dietary_preference": "vegetarian",
            "selected_conditions": ["fever_acute_recovery", "type_2_diabetes"],
            "allergies": [],
            "intolerances": [],
        },
    ).json()

    # Check Fever for vegetarian member -> egg-poultry-whole MUST be excluded
    fever_resp = client.get(
        "/api/v1/conditions/fever_acute_recovery/foods",
        params={"household_token": token, "member_id": mem["id"]},
    )
    assert fever_resp.status_code == 200
    fever_data = fever_resp.json()
    assert fever_data["member_context"]["personalised"] is True
    assert fever_data["member_context"]["dietary_preference"] == "vegetarian"
    fever_slugs = [f["slug"] for f in fever_data["foods"]]
    assert "khichdi-moong-dal-rice" in fever_slugs
    assert "egg-poultry-whole" not in fever_slugs
    assert "chicken-biryani" not in fever_slugs
    assert all(f["dietary_compatibility"]["is_vegetarian"] is True for f in fever_data["foods"])

    # Check Type 2 Diabetes for vegetarian member -> rohu-fish-freshwater MUST be excluded
    t2d_resp = client.get(
        "/api/v1/conditions/type_2_diabetes/foods",
        params={"household_token": token, "member_id": mem["id"]},
    )
    assert t2d_resp.status_code == 200
    t2d_slugs = [f["slug"] for f in t2d_resp.json()["foods"]]
    assert "ragi-finger-millet" in t2d_slugs
    assert "rohu-fish-freshwater" not in t2d_slugs


def test_vegan_member_excludes_dairy_egg_meat_and_fish():
    """
    2. A vegan household member does not receive dairy, egg, meat, poultry, or fish foods.
    """
    client.ensure_authenticated()
    token = client.household_token
    client.post("/api/v1/households", json={"household_token": token, "name": "Vegan Test Household"})
    mem = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Rohan",
            "age_group": "adult",
            "dietary_preference": "vegan",
            "selected_conditions": ["fever_acute_recovery", "osteoporosis_bone_health"],
            "allergies": [],
            "intolerances": [],
        },
    ).json()

    fever_resp = client.get(
        "/api/v1/conditions/fever_acute_recovery/foods",
        params={"household_token": token, "member_id": mem["id"]},
    ).json()
    fever_slugs = [f["slug"] for f in fever_resp["foods"]]

    # Dairy & egg foods must be excluded for vegan member
    assert "buttermilk-chaas" not in fever_slugs
    assert "curd-rice-mosaranna" not in fever_slugs
    assert "egg-poultry-whole" not in fever_slugs
    # Plant-based fever foods remain
    assert "idli-steamed-rice-lentil" in fever_slugs
    assert "rasam-tomato-pepper" in fever_slugs
    assert "banana-ripe" in fever_slugs
    assert all(f["dietary_compatibility"]["is_vegan"] is True for f in fever_resp["foods"])

    # Check Osteoporosis for vegan member -> milk & paneer excluded, ragi & sesame remain
    bone_resp = client.get(
        "/api/v1/conditions/osteoporosis_bone_health/foods",
        params={"household_token": token, "member_id": mem["id"]},
    ).json()
    bone_slugs = [f["slug"] for f in bone_resp["foods"]]
    assert "milk-cow-whole" not in bone_slugs
    assert "paneer-cottage-cheese" not in bone_slugs
    assert "ragi-finger-millet" in bone_slugs
    assert "sesame-seeds-til" in bone_slugs


def test_eggetarian_and_non_vegetarian_members():
    """
    3 & 4. Eggetarian receives vegetarian + egg (no meat/fish).
           Non-vegetarian receives condition-appropriate mapped foods (including egg under Fever
           and Rohu fish under Type 2 Diabetes), but STILL does NOT receive Chicken Biryani under Fever.
    """
    # Eggetarian on Fever -> includes egg-poultry-whole
    egg_fever = client.get(
        "/api/v1/conditions/fever_acute_recovery/foods",
        params={"dietary_preference": "eggetarian"},
    ).json()
    egg_fever_slugs = [f["slug"] for f in egg_fever["foods"]]
    assert "egg-poultry-whole" in egg_fever_slugs
    assert "khichdi-moong-dal-rice" in egg_fever_slugs
    assert "chicken-biryani" not in egg_fever_slugs

    # Eggetarian on Type 2 Diabetes -> excludes rohu-fish-freshwater
    egg_t2d = client.get(
        "/api/v1/conditions/type_2_diabetes/foods",
        params={"dietary_preference": "eggetarian"},
    ).json()
    assert "rohu-fish-freshwater" not in [f["slug"] for f in egg_t2d["foods"]]

    # Non-vegetarian on Fever -> includes egg-poultry-whole, STILL excludes chicken-biryani
    nonveg_fever = client.get(
        "/api/v1/conditions/fever_acute_recovery/foods",
        params={"dietary_preference": "non_vegetarian"},
    ).json()
    nonveg_fever_slugs = [f["slug"] for f in nonveg_fever["foods"]]
    assert "egg-poultry-whole" in nonveg_fever_slugs
    assert "chicken-biryani" not in nonveg_fever_slugs

    # Non-vegetarian on Type 2 Diabetes -> includes rohu-fish-freshwater
    nonveg_t2d = client.get(
        "/api/v1/conditions/type_2_diabetes/foods",
        params={"dietary_preference": "non_vegetarian"},
    ).json()
    assert "rohu-fish-freshwater" in [f["slug"] for f in nonveg_t2d["foods"]]


# ============================================================================
# TEST GROUP 3 — OTHER CONDITION & CLINICAL SAFETY TESTS
# ============================================================================
def test_category_membership_alone_never_selects_food():
    """
    1. A food is NOT returned for a condition merely because its category appears in relevant_food_groups.
       For example, fever_acute_recovery lists 'indian-dishes' and 'fruits' in relevant_food_groups,
       but unmapped items in those categories (e.g., masala-dosa, chole-bhature, mango-ripe-banganapalli)
       must NOT appear.
    """
    cond_detail = client.get("/api/v1/conditions/fever_acute_recovery").json()
    assert "indian-dishes" in cond_detail["relevant_food_groups"]
    assert "fruits" in cond_detail["relevant_food_groups"]

    fever_foods = client.get("/api/v1/conditions/fever_acute_recovery/foods").json()
    fever_slugs = {f["slug"] for f in fever_foods["foods"]}

    for unmapped_slug in [
        "chicken-biryani",
        "masala-dosa",
        "chole-bhature",
        "paneer-butter-masala",
        "mango-ripe-banganapalli",
    ]:
        assert unmapped_slug not in fever_slugs


def test_missing_nutrients_preserved_as_null_and_insufficient_information():
    """
    2. Foods with missing relevant nutrients are handled honestly:
       Under chronic_kidney_disease, packaged-glucose-biscuits has NULL potassium_mg (never 0)
       and relevance_type == 'insufficient_information'.
    """
    ckd_resp = client.get("/api/v1/conditions/chronic_kidney_disease/foods")
    assert ckd_resp.status_code == 200
    ckd_data = ckd_resp.json()

    biscuit = next(
        (f for f in ckd_data["foods"] if f["slug"] == "packaged-glucose-biscuits"),
        None,
    )
    assert biscuit is not None
    assert biscuit["relevance_type"] == "insufficient_information"
    assert biscuit["relevance_label"] == "Insufficient information"
    assert biscuit["nutrition_highlights"]["potassium_mg"] is None
    assert "potassium_mg" in biscuit["missing_relevant_nutrients"]


def test_foods_requiring_clinical_context_labelled_individualised_advice_required():
    """
    3. Foods requiring clinical context are labelled 'individualised_advice_required'.
       Under chronic_kidney_disease, spinach-palak and toor-dal-red-gram require stage-specific
       potassium/phosphorus/protein individualisation.
    """
    ckd_data = client.get("/api/v1/conditions/chronic_kidney_disease/foods").json()
    by_slug = {f["slug"]: f for f in ckd_data["foods"]}

    assert "spinach-palak" in by_slug
    assert by_slug["spinach-palak"]["relevance_type"] == "individualised_advice_required"
    assert by_slug["spinach-palak"]["relevance_label"] == "Individualised advice required"

    assert "toor-dal-red-gram" in by_slug
    assert by_slug["toor-dal-red-gram"]["relevance_type"] == "individualised_advice_required"


def test_allergen_and_intolerance_warnings_for_household_member():
    """
    4. Member allergies and intolerances generate explicit warnings on condition-recommended foods.
    """
    client.ensure_authenticated()
    token = client.household_token
    client.post("/api/v1/households", json={"household_token": token, "name": "Allergy Test Household"})
    mem = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Meera",
            "age_group": "adult",
            "dietary_preference": "eggetarian",
            "selected_conditions": ["fever_acute_recovery"],
            "allergies": ["egg"],
            "intolerances": ["lactose"],
        },
    ).json()

    fever_data = client.get(
        "/api/v1/conditions/fever_acute_recovery/foods",
        params={"household_token": token, "member_id": mem["id"]},
    ).json()
    by_slug = {f["slug"]: f for f in fever_data["foods"]}

    # Egg must carry an explicit allergen warning for Meera
    assert "egg-poultry-whole" in by_slug
    assert len(by_slug["egg-poultry-whole"]["allergen_warnings"]) >= 1
    assert "egg" in by_slug["egg-poultry-whole"]["allergen_warnings"][0].lower()

    # Buttermilk must carry an explicit lactose intolerance warning for Meera
    assert "buttermilk-chaas" in by_slug
    assert len(by_slug["buttermilk-chaas"]["intolerance_warnings"]) >= 1
    assert "lactose" in by_slug["buttermilk-chaas"]["intolerance_warnings"][0].lower()


def test_empty_state_when_no_reviewed_mappings_exist_and_no_prohibited_labels():
    """
    5 & 6. When a condition has no reviewed mappings, return an empty list with the honest
           empty_state_message. Never use prohibited simplistic labels across any condition.
    """
    prohibited_labels = {"safe", "unsafe", "allowed", "forbidden", "cures"}

    all_conditions = client.get("/api/v1/conditions").json()
    assert len(all_conditions) >= 24

    for cond in all_conditions:
        res = client.get(f"/api/v1/conditions/{cond['code']}/foods")
        assert res.status_code == 200
        payload = res.json()
        assert len(payload["foods"]) >= 1, f"Expected reviewed mappings for {cond['code']}"
        for item in payload["foods"]:
            assert item["relevance_type"].lower() not in prohibited_labels
            assert item["relevance_label"].lower() not in prohibited_labels

    # Temporarily create a condition with zero mappings in the isolated test DB to verify empty state
    db = SessionLocal()
    try:
        src = db.query(DataSource).first()
        temp_cond = HealthCondition(
            code="temp_unmapped_condition_test",
            name="Temporary Unmapped Condition",
            condition_group_code="A_metabolic",
            condition_group_name="Metabolic",
            is_short_term_illness=False,
            is_special_life_stage=False,
            applicable_age_groups=["adult"],
            nutritional_meaning="Test condition with zero reviewed food mappings.",
            relevant_nutrients=["energy_kcal"],
            relevant_food_groups=["indian-dishes"],
            evidence_dietary_patterns="Test.",
            portion_considerations="Test.",
            individual_differences="Test.",
            professional_advice_circumstances="Test.",
            what_evidence_does_not_establish="Test.",
            source_id=src.id,
            publication_year=2024,
            review_status="reviewed",
        )
        db.add(temp_cond)
        db.commit()

        empty_res = client.get("/api/v1/conditions/temp_unmapped_condition_test/foods")
        assert empty_res.status_code == 200
        empty_payload = empty_res.json()
        assert empty_payload["foods"] == []
        assert empty_payload["total_reviewed_foods"] == 0
        assert (
            empty_payload["empty_state_message"]
            == "No sufficiently reviewed food recommendations are available for this condition yet."
        )
    finally:
        db.query(HealthCondition).filter(
            HealthCondition.code == "temp_unmapped_condition_test"
        ).delete()
        db.commit()
        db.close()
