from enum import Enum


class WorkflowType(str, Enum):
    PRODUCT_QUOTE = "PRODUCT_QUOTE"
    TECHNICAL_QUOTE = "TECHNICAL_QUOTE"


class OfferBasis(str, Enum):
    SUPPLY_ONLY = "SUPPLY_ONLY"
    SUPPLY_AND_INSTALL = "SUPPLY_AND_INSTALL"
    LABOR_ONLY = "LABOR_ONLY"
    MIXED = "MIXED"


class DocumentType(str, Enum):
    INQUIRY = "INQUIRY"
    PRODUCT_LIST = "PRODUCT_LIST"
    BOQ = "BOQ"
    OTHER = "OTHER"


class FileFormat(str, Enum):
    PDF = "PDF"
    XLSX = "XLSX"
    CSV = "CSV"
    EML = "EML"


class ProcessingStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    MAPPING_REQUIRED = "MAPPING_REQUIRED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FAILED = "FAILED"
    UNSUPPORTED_INPUT = "UNSUPPORTED_INPUT"


class ApprovalState(str, Enum):
    DRAFT = "DRAFT"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    APPROVED = "APPROVED"
    EXPORTED = "EXPORTED"
    FAILED = "FAILED"


class ItemType(str, Enum):
    PRODUCT = "PRODUCT"
    WORK = "WORK"
    SERVICE = "SERVICE"
    COMPOSITE = "COMPOSITE"


class ReviewStatus(str, Enum):
    EXTRACTED = "EXTRACTED"
    EXACT_MATCH = "EXACT_MATCH"
    SUGGESTED_MATCH = "SUGGESTED_MATCH"
    AMBIGUOUS = "AMBIGUOUS"
    UNMATCHED = "UNMATCHED"
    MISSING_PRICE = "MISSING_PRICE"
    INVALID_INPUT = "INVALID_INPUT"
    MANUALLY_CONFIRMED = "MANUALLY_CONFIRMED"


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NONE = "NONE"


class PriceStatus(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    AVAILABLE = "AVAILABLE"
    MISSING_PRICE = "MISSING_PRICE"


class AvailabilityStatus(str, Enum):
    NOT_CHECKED = "NOT_CHECKED"
    UNKNOWN = "UNKNOWN"