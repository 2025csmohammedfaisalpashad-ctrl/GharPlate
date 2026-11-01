"""
Comprehensive Automated Test Suite for Real Database-Backed Authentication,
Argon2id Password Hashing, HttpOnly Sessions, CSRF Protection, Strict Household Isolation,
and Persistent AI Assistant Conversations (Mandatory Scenarios Test A through Test H).
"""

from unittest.mock import patch
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.entities import (
    AssistantConversation,
    AssistantMessage,
    UserAccount,
    UserSession,
)


def _csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get(settings.CSRF_COOKIE_NAME, "")
    return {"X-CSRF-Token": token} if token else {}


def test_unauthenticated_private_endpoints_reject_requests_with_401():
    """
    Verifies that private application endpoints reject unauthenticated requests with 401
    and do not allow passwordless household token access.
    """
    anon = TestClient(app)
    assert anon.get("/api/v1/auth/me").status_code == 401
    assert anon.get("/api/v1/foods").status_code == 401
    assert anon.get("/api/v1/conditions").status_code == 401
    assert anon.get("/api/v1/households/hh_fake_token").status_code == 401
    assert anon.get("/api/v1/recipes").status_code == 401
    assert anon.get("/api/v1/assistant/conversations").status_code == 401
    assert (
        anon.post(
            "/api/v1/assistant/chat",
            json={"message": "Hello", "mode": "database_only", "history": []},
        ).status_code
        == 401
    )


def test_mandatory_scenarios_A_through_H_real_auth_isolation_and_assistant_persistence():
    """
    Executes all mandatory verification scenarios end-to-end against the FastAPI backend and SQLite database:
    - Test A: Register User A with email and password -> succeeds, hashes password with Argon2id (never plaintext).
    - Test B: Log out and try to log in with an unregistered email -> denied (401).
    - Test C: Try to log in with User A's email and wrong password -> denied (401).
    - Test D: Log in with User A's correct email and password -> succeeds; User A's family members & saved info appear.
    - Test E: Register User B with a different email -> sees a fresh household without User A's family members, recipes, or chats.
    - Test F: Attempt to access User A's household, recipes, or assistant conversations using User B's session -> rejected (403).
    - Test G: Log out and log back into User A -> User A's previous household and assistant conversations are restored.
    - Test H: Simulate backend session/DB restart -> registered accounts, households, recipes, and conversations remain persisted.
    """
    client_a = TestClient(app)
    client_b = TestClient(app)

    user_a_email = "ananya.rao@gharplate.in"
    user_a_pass = "AnanyaStrongPass#2026"
    user_b_email = "rohan.desai@gharplate.in"
    user_b_pass = "RohanStrongPass#2026"

    # =========================================================================
    # TEST A — Register User A
    # =========================================================================
    reg_a = client_a.post(
        "/api/v1/auth/register",
        json={
            "name": "Ananya Rao",
            "email": "  Ananya.Rao@GharPlate.in ",
            "password": user_a_pass,
            "password_confirmation": user_a_pass,
            "remember_me": True,
        },
    )
    assert reg_a.status_code == 201
    data_a = reg_a.json()
    assert data_a["authenticated"] is True
    assert data_a["user"]["email"] == user_a_email
    assert data_a["user"]["full_name"] == "Ananya Rao"
    user_a_id = data_a["user"]["id"]
    hh_a_token = data_a["household"]["household_token"]
    assert hh_a_token.startswith("hh_")

    # Verify HttpOnly session cookie and CSRF cookie were set
    assert settings.SESSION_COOKIE_NAME in client_a.cookies
    assert settings.CSRF_COOKIE_NAME in client_a.cookies

    # Verify password is stored as Argon2id hash in user_accounts and NEVER plaintext
    db = SessionLocal()
    try:
        db_user_a = db.query(UserAccount).filter(UserAccount.id == user_a_id).first()
        assert db_user_a is not None
        assert db_user_a.password_hash.startswith("$argon2id$")
        assert user_a_pass not in db_user_a.password_hash

        # Verify session token is stored hashed in user_sessions, never raw
        raw_session_cookie = client_a.cookies.get(settings.SESSION_COOKIE_NAME)
        db_sess_a = (
            db.query(UserSession).filter(UserSession.user_id == user_a_id).first()
        )
        assert db_sess_a is not None
        assert db_sess_a.session_token_hash != raw_session_cookie
    finally:
        db.close()

    # Duplicate registration with same email must fail with 409
    dup_reg = client_a.post(
        "/api/v1/auth/register",
        json={
            "name": "Duplicate Ananya",
            "email": user_a_email.upper(),
            "password": user_a_pass,
            "password_confirmation": user_a_pass,
            "remember_me": False,
        },
    )
    assert dup_reg.status_code == 409

    # Add a family member, a saved recipe, and an AI Assistant conversation for User A
    mem_a_resp = client_a.post(
        f"/api/v1/households/{hh_a_token}/members",
        headers=_csrf_headers(client_a),
        json={
            "display_name": "Ajji Lakshmi",
            "age_group": "older_adult",
            "dietary_preference": "vegetarian",
            "selected_conditions": ["type_2_diabetes", "hypertension"],
            "allergies": ["peanut"],
            "intolerances": ["lactose"],
            "dietary_restrictions": ["low_salt"],
            "food_preferences": ["south_indian"],
        },
    )
    assert mem_a_resp.status_code == 200
    member_a_id = mem_a_resp.json()["id"]

    rec_a_resp = client_a.post(
        "/api/v1/recipes/calculate",
        headers=_csrf_headers(client_a),
        json={
            "household_token": hh_a_token,
            "title": "Ananya's Private Ragi Mudde",
            "description": "User A private recipe",
            "servings": 2.0,
            "meal_type": "lunch",
            "ingredients": [
                {"food_slug": "ragi-finger-millet", "quantity": 1.0, "unit_name": "100g"}
            ],
        },
    )
    assert rec_a_resp.status_code == 200
    recipe_a_id = rec_a_resp.json()["id"]

    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline during test"),
    ):
        chat_a_resp = client_a.post(
            "/api/v1/assistant/chat",
            headers=_csrf_headers(client_a),
            json={
                "message": "What are the ingredients in Pineapple Cake?",
                "mode": "database_only",
                "history": [],
                "context": {
                    "current_path": "/foods/pkg-pineapple-cake-6b35c3",
                    "food_slug": "pkg-pineapple-cake-6b35c3",
                },
            },
        )
        assert chat_a_resp.status_code == 200
        chat_a_body = chat_a_resp.json()
        conv_a_id = chat_a_body["conversation_id"]
        assert conv_a_id is not None

    # Verify CSRF enforcement: state-changing POST without X-CSRF-Token must be rejected with 403
    no_csrf_resp = client_a.post(
        f"/api/v1/households/{hh_a_token}/members",
        json={"display_name": "Should Fail CSRF", "age_group": "adult"},
    )
    assert no_csrf_resp.status_code == 403

    # =========================================================================
    # TEST B — Log out User A and try to log in with an unregistered email
    # =========================================================================
    logout_a = client_a.post("/api/v1/auth/logout", headers=_csrf_headers(client_a))
    assert logout_a.status_code == 200
    assert logout_a.json()["logged_out"] is True

    # Session is now revoked: calling /auth/me must return 401
    assert client_a.get("/api/v1/auth/me").status_code == 401

    unregistered_login = client_a.post(
        "/api/v1/auth/login",
        json={
            "email": "never.registered.user@gharplate.in",
            "password": "SomePassword123!",
            "remember_me": False,
        },
    )
    assert unregistered_login.status_code == 401
    assert "Invalid email address or password" in unregistered_login.json()["detail"]
    assert client_a.get("/api/v1/auth/me").status_code == 401

    # =========================================================================
    # TEST C — Try to log in with User A's email and wrong password
    # =========================================================================
    wrong_pw_login = client_a.post(
        "/api/v1/auth/login",
        json={
            "email": user_a_email,
            "password": "WrongPassword999!",
            "remember_me": False,
        },
    )
    assert wrong_pw_login.status_code == 401
    assert "Invalid email address or password" in wrong_pw_login.json()["detail"]
    assert client_a.get("/api/v1/auth/me").status_code == 401

    # =========================================================================
    # TEST D — Log in with User A's correct email and password
    # =========================================================================
    login_a = client_a.post(
        "/api/v1/auth/login",
        json={
            "email": user_a_email,
            "password": user_a_pass,
            "remember_me": True,
        },
    )
    assert login_a.status_code == 200
    login_a_body = login_a.json()
    assert login_a_body["authenticated"] is True
    assert login_a_body["user"]["id"] == user_a_id
    assert login_a_body["household"]["household_token"] == hh_a_token
    assert len(login_a_body["household"]["members"]) == 1
    assert login_a_body["household"]["members"][0]["display_name"] == "Ajji Lakshmi"

    # =========================================================================
    # TEST E — Register User B with a different email -> fresh isolated household
    # =========================================================================
    reg_b = client_b.post(
        "/api/v1/auth/register",
        json={
            "name": "Rohan Desai",
            "email": user_b_email,
            "password": user_b_pass,
            "password_confirmation": user_b_pass,
            "remember_me": False,
        },
    )
    assert reg_b.status_code == 201
    data_b = reg_b.json()
    hh_b_token = data_b["household"]["household_token"]
    assert hh_b_token != hh_a_token
    assert data_b["household"]["members"] == []

    # User B's recipes list must NOT include User A's private recipe
    recipes_b = client_b.get("/api/v1/recipes").json()
    assert all(r["id"] != recipe_a_id for r in recipes_b)
    assert all("Ananya's Private Ragi Mudde" not in r["title"] for r in recipes_b)

    # User B's assistant conversations must be empty (must NOT see User A's conversation)
    convs_b = client_b.get("/api/v1/assistant/conversations").json()
    assert convs_b == []

    # =========================================================================
    # TEST F — Attempt to access User A's household, member, recipe, or chat using User B's session
    # =========================================================================
    # 1. User B tries to fetch User A's household by token -> 403 Forbidden
    assert client_b.get(f"/api/v1/households/{hh_a_token}").status_code == 403

    # 2. User B tries to add a member to User A's household -> 403 Forbidden
    assert (
        client_b.post(
            f"/api/v1/households/{hh_a_token}/members",
            headers=_csrf_headers(client_b),
            json={"display_name": "Intruder", "age_group": "adult"},
        ).status_code
        == 403
    )

    # 3. User B tries to update or delete User A's family member using User B's token -> 404 (not in User B's household)
    assert (
        client_b.delete(
            f"/api/v1/households/{hh_b_token}/members/{member_a_id}",
            headers=_csrf_headers(client_b),
        ).status_code
        == 404
    )

    # 4. User B tries to query condition foods using User A's household_token or member_id -> 403 Forbidden
    assert (
        client_b.get(
            "/api/v1/conditions/type_2_diabetes/foods",
            params={"household_token": hh_a_token, "member_id": member_a_id},
        ).status_code
        == 403
    )
    assert (
        client_b.get(
            "/api/v1/conditions/type_2_diabetes/foods",
            params={"member_id": member_a_id},
        ).status_code
        == 403
    )

    # 5. User B tries to view, update, or delete User A's private recipe -> 403 Forbidden
    assert client_b.get(f"/api/v1/recipes/{recipe_a_id}").status_code == 403
    assert (
        client_b.put(
            f"/api/v1/recipes/{recipe_a_id}",
            headers=_csrf_headers(client_b),
            json={
                "household_token": hh_b_token,
                "title": "Hijacked Recipe",
                "servings": 1.0,
                "meal_type": "lunch",
                "ingredients": [
                    {"food_slug": "ragi-finger-millet", "quantity": 1.0, "unit_name": "100g"}
                ],
            },
        ).status_code
        == 403
    )
    assert (
        client_b.delete(
            f"/api/v1/recipes/{recipe_a_id}",
            headers=_csrf_headers(client_b),
        ).status_code
        == 403
    )

    # 6. User B tries to read, post to, or delete User A's assistant conversation -> 403 Forbidden
    assert (
        client_b.get(f"/api/v1/assistant/conversations/{conv_a_id}").status_code == 403
    )
    assert (
        client_b.delete(
            f"/api/v1/assistant/conversations/{conv_a_id}",
            headers=_csrf_headers(client_b),
        ).status_code
        == 403
    )
    assert (
        client_b.post(
            "/api/v1/assistant/chat",
            headers=_csrf_headers(client_b),
            json={
                "conversation_id": conv_a_id,
                "message": "Try reading User A chat",
                "mode": "database_only",
                "history": [],
            },
        ).status_code
        == 403
    )

    # =========================================================================
    # TEST G — Log out and log back into User A -> household, recipes & conversations restored
    # =========================================================================
    client_a.post("/api/v1/auth/logout", headers=_csrf_headers(client_a))
    assert client_a.get("/api/v1/auth/me").status_code == 401

    relogin_a = client_a.post(
        "/api/v1/auth/login",
        json={
            "email": user_a_email,
            "password": user_a_pass,
            "remember_me": True,
        },
    )
    assert relogin_a.status_code == 200
    me_a = client_a.get("/api/v1/auth/me").json()
    assert me_a["household"]["household_token"] == hh_a_token
    assert len(me_a["household"]["members"]) == 1
    assert me_a["household"]["members"][0]["display_name"] == "Ajji Lakshmi"

    # Verify User A's assistant conversation & messages are restored from the database
    convs_a = client_a.get("/api/v1/assistant/conversations").json()
    assert len(convs_a) >= 1
    assert any(c["id"] == conv_a_id for c in convs_a)

    conv_a_detail = client_a.get(f"/api/v1/assistant/conversations/{conv_a_id}").json()
    assert conv_a_detail["id"] == conv_a_id
    assert len(conv_a_detail["messages"]) == 2
    assert conv_a_detail["messages"][0]["role"] == "user"
    assert (
        conv_a_detail["messages"][0]["content"]
        == "What are the ingredients in Pineapple Cake?"
    )
    assert conv_a_detail["messages"][1]["role"] == "assistant"
    assert "Pineapple Cake" in conv_a_detail["messages"][1]["content"]

    # Continue the existing conversation with a follow-up question
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline during test"),
    ):
        followup_resp = client_a.post(
            "/api/v1/assistant/chat",
            headers=_csrf_headers(client_a),
            json={
                "conversation_id": conv_a_id,
                "message": "Why are the nutritional values missing?",
                "mode": "database_only",
                "history": [],
                "context": {
                    "current_path": "/foods/pkg-pineapple-cake-6b35c3",
                    "food_slug": "pkg-pineapple-cake-6b35c3",
                },
            },
        )
        assert followup_resp.status_code == 200
        assert followup_resp.json()["conversation_id"] == conv_a_id

    updated_conv_a = client_a.get(f"/api/v1/assistant/conversations/{conv_a_id}").json()
    assert len(updated_conv_a["messages"]) == 4

    # =========================================================================
    # TEST H — Simulate application restart / fresh DB session & verify persistence
    # =========================================================================
    db_verify = SessionLocal()
    try:
        persisted_user_a = (
            db_verify.query(UserAccount)
            .filter(UserAccount.email == user_a_email)
            .first()
        )
        persisted_user_b = (
            db_verify.query(UserAccount)
            .filter(UserAccount.email == user_b_email)
            .first()
        )
        assert persisted_user_a is not None
        assert persisted_user_b is not None

        persisted_conv = (
            db_verify.query(AssistantConversation)
            .filter(
                AssistantConversation.id == conv_a_id,
                AssistantConversation.user_id == user_a_id,
            )
            .first()
        )
        assert persisted_conv is not None
        persisted_msg_count = (
            db_verify.query(AssistantMessage)
            .filter(AssistantMessage.conversation_id == conv_a_id)
            .count()
        )
        assert persisted_msg_count == 4
    finally:
        db_verify.close()

    # Delete conversation as User A and verify deletion
    del_conv = client_a.delete(
        f"/api/v1/assistant/conversations/{conv_a_id}",
        headers=_csrf_headers(client_a),
    )
    assert del_conv.status_code == 200
    assert del_conv.json()["deleted"] is True
    assert client_a.get(f"/api/v1/assistant/conversations/{conv_a_id}").status_code == 404


def test_new_chat_conversation_switching_renaming_search_and_isolation():
    """
    Verifies all 8 conversation-management scenarios on the backend:
    1. Conversation 1 has 5 messages stored in chronological order.
    2. Creating a New Chat creates Conversation 2 with a new unique ID and 0 messages.
    3. Sending a new message in Conversation 2 appends ONLY to Conversation 2 and updates its title & preview.
    4. Reopening Conversation 1 returns all 5 original messages intact without Conversation 2's messages.
    5. Switching to Conversation 2 returns only Conversation 2's messages.
    6. Renaming Conversation 1 via PATCH updates its title and rejects cross-user rename (403).
    7. Searching conversations (?q=...) filters by title or message content.
    8. Another authenticated user cannot view, rename, or delete either conversation (403).
    """
    client_1 = TestClient(app)
    client_2 = TestClient(app)

    client_1.post(
        "/api/v1/auth/register",
        json={
            "name": "Kavya Nair",
            "email": "kavya.nair@gharplate.in",
            "password": "KavyaStrongPass#2026",
            "password_confirmation": "KavyaStrongPass#2026",
            "remember_me": True,
        },
    )
    client_2.post(
        "/api/v1/auth/register",
        json={
            "name": "Vikram Kulkarni",
            "email": "vikram.kulkarni@gharplate.in",
            "password": "VikramStrongPass#2026",
            "password_confirmation": "VikramStrongPass#2026",
            "remember_me": True,
        },
    )

    # Create Conversation 1 and populate 5 messages in chronological order
    conv1_create = client_1.post(
        "/api/v1/assistant/conversations",
        headers=_csrf_headers(client_1),
        json={"title": "Ragi & Millet Discussion"},
    )
    assert conv1_create.status_code == 201
    conv1_id = conv1_create.json()["id"]

    db = SessionLocal()
    try:
        conv1_obj = (
            db.query(AssistantConversation)
            .filter(AssistantConversation.id == conv1_id)
            .first()
        )
        assert conv1_obj is not None
        five_messages = [
            ("user", "First question: What is the calcium in Ragi?"),
            ("assistant", "First reply: Ragi provides 364 mg calcium per 100g (IFCT 2017)."),
            ("user", "Second question: Is Ragi Mudde vegetarian?"),
            ("assistant", "Second reply: Yes, Ragi Mudde is 100% vegetarian and vegan."),
            ("user", "Third question: Can we pair Ragi with Sambar?"),
        ]
        for role, text in five_messages:
            db.add(
                AssistantMessage(
                    conversation_id=conv1_id,
                    user_id=conv1_obj.user_id,
                    role=role,
                    content=text,
                )
            )
        db.commit()
    finally:
        db.close()

    # Step 1: Open existing Conversation 1 containing 5 messages
    conv1_detail = client_1.get(f"/api/v1/assistant/conversations/{conv1_id}").json()
    assert len(conv1_detail["messages"]) == 5
    assert (
        conv1_detail["messages"][0]["content"]
        == "First question: What is the calcium in Ragi?"
    )
    assert (
        conv1_detail["messages"][4]["content"]
        == "Third question: Can we pair Ragi with Sambar?"
    )

    # Step 2 & 3: Click New Chat -> creates Conversation 2 with a new unique ID and 0 messages
    conv2_create = client_1.post(
        "/api/v1/assistant/conversations",
        headers=_csrf_headers(client_1),
        json={"title": "New Chat"},
    )
    assert conv2_create.status_code == 201
    conv2 = conv2_create.json()
    conv2_id = conv2["id"]
    assert conv2_id != conv1_id
    assert conv2["messages"] == []

    # Step 4: Send a new message in Conversation 2 -> appears ONLY in Conversation 2
    with patch(
        "app.services.ollama_assistant_service.discover_ollama_models",
        return_value=(False, [], "Offline during test"),
    ):
        chat2_resp = client_1.post(
            "/api/v1/assistant/chat",
            headers=_csrf_headers(client_1),
            json={
                "conversation_id": conv2_id,
                "message": "Which foods are reviewed for Fever recovery?",
                "mode": "database_only",
                "history": [],
            },
        )
        assert chat2_resp.status_code == 200
        chat2_data = chat2_resp.json()
        assert chat2_data["conversation_id"] == conv2_id
        assert "Fever" in chat2_data["conversation_title"]

    # Step 5: Reopen Conversation 1 -> confirm all 5 original messages remain untouched
    conv1_reopen = client_1.get(f"/api/v1/assistant/conversations/{conv1_id}").json()
    assert len(conv1_reopen["messages"]) == 5
    assert all(
        "Fever recovery" not in m["content"] for m in conv1_reopen["messages"]
    )

    # Step 6: Switch back to Conversation 2 -> confirm its messages are completely separate (2 messages: user + assistant)
    conv2_reopen = client_1.get(f"/api/v1/assistant/conversations/{conv2_id}").json()
    assert len(conv2_reopen["messages"]) == 2
    assert (
        conv2_reopen["messages"][0]["content"]
        == "Which foods are reviewed for Fever recovery?"
    )
    assert all("Ragi" not in m["content"] for m in conv2_reopen["messages"])

    # Step 7: Rename Conversation 1 & Search Saved Conversations
    rename_resp = client_1.patch(
        f"/api/v1/assistant/conversations/{conv1_id}",
        headers=_csrf_headers(client_1),
        json={"title": "Karnataka Ragi Calcium Notes"},
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["title"] == "Karnataka Ragi Calcium Notes"
    assert rename_resp.json()["last_message_preview"] is not None

    search_ragi = client_1.get(
        "/api/v1/assistant/conversations", params={"q": "Calcium"}
    ).json()
    assert len(search_ragi) == 1
    assert search_ragi[0]["id"] == conv1_id

    # Step 8: Confirm User 2 cannot view, rename, or delete User 1's conversations
    assert client_2.get("/api/v1/assistant/conversations").json() == []
    assert (
        client_2.get(f"/api/v1/assistant/conversations/{conv1_id}").status_code == 403
    )
    assert (
        client_2.patch(
            f"/api/v1/assistant/conversations/{conv1_id}",
            headers=_csrf_headers(client_2),
            json={"title": "Hijacked Title"},
        ).status_code
        == 403
    )
    assert (
        client_2.delete(
            f"/api/v1/assistant/conversations/{conv2_id}",
            headers=_csrf_headers(client_2),
        ).status_code
        == 403
    )
