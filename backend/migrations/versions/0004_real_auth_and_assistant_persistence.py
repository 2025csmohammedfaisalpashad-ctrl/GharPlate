"""Add user accounts, server-validated sessions, household ownership, and persistent AI assistant conversations

Revision ID: 0004_real_auth_and_assistant_persistence
Revises: 0003_product_provenance_and_cache
Create Date: 2026-11-01 20:50:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_real_auth_and_assistant_persistence"
down_revision = "0003_product_provenance_and_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "user_accounts" not in existing_tables:
        op.create_table(
            "user_accounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=255), nullable=False),
            sa.Column("full_name", sa.String(length=120), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("email", name="uq_user_accounts_email"),
        )
        op.create_index("ix_user_accounts_email", "user_accounts", ["email"], unique=True)

    if "user_sessions" not in existing_tables:
        op.create_table(
            "user_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("user_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("session_token_hash", sa.String(length=128), nullable=False),
            sa.Column("csrf_token_hash", sa.String(length=128), nullable=False),
            sa.Column("remember_me", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=300), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("session_token_hash", name="uq_user_sessions_token_hash"),
        )
        op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
        op.create_index(
            "ix_user_sessions_token_hash", "user_sessions", ["session_token_hash"], unique=True
        )

    if "households" in existing_tables:
        hh_cols = {c["name"] for c in inspector.get_columns("households")}
        hh_indexes = {idx["name"] for idx in inspector.get_indexes("households")}
        if "owner_user_id" not in hh_cols:
            with op.batch_alter_table("households") as batch_op:
                batch_op.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
                if "ix_households_owner_user_id" not in hh_indexes:
                    batch_op.create_index("ix_households_owner_user_id", ["owner_user_id"])

    if "assistant_conversations" not in existing_tables:
        op.create_table(
            "assistant_conversations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("user_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "household_id",
                sa.Integer(),
                sa.ForeignKey("households.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_assistant_conversations_user_id", "assistant_conversations", ["user_id"])

    if "assistant_messages" not in existing_tables:
        op.create_table(
            "assistant_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "conversation_id",
                sa.Integer(),
                sa.ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("user_accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(length=30), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("mode_used", sa.String(length=40), nullable=True),
            sa.Column("model_used", sa.String(length=100), nullable=True),
            sa.Column("ollama_connected", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("tool_traces", sa.JSON(), nullable=False),
            sa.Column("sources", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_assistant_messages_conversation_id", "assistant_messages", ["conversation_id"]
        )
        op.create_index("ix_assistant_messages_user_id", "assistant_messages", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "assistant_messages" in existing_tables:
        op.drop_table("assistant_messages")
    if "assistant_conversations" in existing_tables:
        op.drop_table("assistant_conversations")
    if "households" in existing_tables:
        hh_cols = {c["name"] for c in inspector.get_columns("households")}
        hh_indexes = {idx["name"] for idx in inspector.get_indexes("households")}
        with op.batch_alter_table("households") as batch_op:
            if "ix_households_owner_user_id" in hh_indexes:
                batch_op.drop_index("ix_households_owner_user_id")
            if "owner_user_id" in hh_cols:
                batch_op.drop_column("owner_user_id")
    if "user_sessions" in existing_tables:
        op.drop_table("user_sessions")
    if "user_accounts" in existing_tables:
        op.drop_table("user_accounts")
