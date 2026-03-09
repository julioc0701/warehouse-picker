from datetime import datetime
from sqlalchemy import Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    badge: Mapped[str | None] = mapped_column(String(100), unique=True)
    sessions: Mapped[list["Session"]] = relationship(back_populates="operator")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    operator_id: Mapped[int | None] = mapped_column(ForeignKey("operators.id"))
    status: Mapped[str] = mapped_column(String(20), default="open")
    # open | in_progress | completed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    operator: Mapped["Operator | None"] = relationship(back_populates="sessions")
    items: Mapped[list["PickingItem"]] = relationship(back_populates="session", order_by="PickingItem.id")
    labels: Mapped[list["Label"]] = relationship(back_populates="session")


class PickingItem(Base):
    __tablename__ = "picking_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    qty_required: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_picked: Mapped[int] = mapped_column(Integer, default=0)
    shortage_qty: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | in_progress | complete | partial | out_of_stock
    notes: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    session: Mapped["Session"] = relationship(back_populates="items")
    scan_events: Mapped[list["ScanEvent"]] = relationship(back_populates="item")


class Barcode(Base):
    __tablename__ = "barcodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    barcode: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    added_by: Mapped[int | None] = mapped_column(ForeignKey("operators.id"))
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Label(Base):
    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    sku: Mapped[str] = mapped_column(String(100), nullable=False)
    label_index: Mapped[int] = mapped_column(Integer, nullable=False)
    zpl_content: Mapped[str] = mapped_column(Text, nullable=False)
    printed: Mapped[bool] = mapped_column(Boolean, default=False)
    printed_at: Mapped[datetime | None] = mapped_column(DateTime)

    session: Mapped["Session"] = relationship(back_populates="labels")


class ScanEvent(Base):
    __tablename__ = "scan_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"), nullable=False)
    picking_item_id: Mapped[int] = mapped_column(ForeignKey("picking_items.id"), nullable=False)
    barcode: Mapped[str] = mapped_column(String(200), nullable=False)
    operator_id: Mapped[int] = mapped_column(ForeignKey("operators.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # scan | undo | shortage | out_of_stock | substitution | reopen
    qty_delta: Mapped[int] = mapped_column(Integer, default=1)
    scanned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    item: Mapped["PickingItem"] = relationship(back_populates="scan_events")


class Printer(Base):
    __tablename__ = "printers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=9100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
