"""users and auth

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the users, email codes and refresh tokens tables."""
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('full_name', sa.String(length=100), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('role', sa.String(length=20), server_default='user', nullable=False),
    sa.Column('email_verified', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('status', sa.String(length=10), server_default='active', nullable=False),
    sa.Column('failed_logins', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("role IN ('user', 'moderator')", name='ck_users_role'),
    sa.CheckConstraint("status IN ('active', 'suspended')", name='ck_users_status'),
    sa.CheckConstraint('email = lower(email)', name='ck_users_email_lower'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email', name='uq_users_email')
    )
    op.create_table('email_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('purpose', sa.String(length=10), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.CheckConstraint("purpose IN ('verify', 'reset')", name='ck_email_codes_purpose'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_email_codes_user_purpose', 'email_codes', ['user_id', 'purpose'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoke_reason', sa.String(length=10), nullable=True),
    sa.CheckConstraint("revoke_reason IN ('rotated', 'logout', 'reset', 'reuse', 'suspended')",
                       name='ck_refresh_tokens_reason'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash', name='uq_refresh_tokens_hash')
    )
    op.create_index('ix_refresh_tokens_user', 'refresh_tokens', ['user_id'], unique=False)


def downgrade() -> None:
    """Drop the auth tables."""
    op.drop_index('ix_refresh_tokens_user', table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index('ix_email_codes_user_purpose', table_name='email_codes')
    op.drop_table('email_codes')
    op.drop_table('users')
