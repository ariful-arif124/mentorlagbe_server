
const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { getStripe } = require("../config/stripe");
const { getPaymentsCollection } = require("../models/paymentModel");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const plans = {
    student: {
        amount: 1000,
        productName: "MentorLagbe Student Pro Membership",
    },
    tutor: {
        amount: 1500,
        productName: "MentorLagbe Tutor Pro Membership",
    },
};

const formatPayment = (payment) => ({
    paymentId: payment._id.toString(),
    role: payment.role,
    plan: payment.plan,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    checkoutSessionId: payment.checkoutSessionId || null,
    paymentIntentId: payment.paymentIntentId || null,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt || null,
});

const getPaymentFromSession = async (session) => {
    const metadata = session.metadata || {};

    const { paymentId, userId, role, plan } = metadata;

    if (
        !ObjectId.isValid(paymentId) ||
        !ObjectId.isValid(userId)
    ) {
        throw new Error("Invalid Stripe payment metadata");
    }

    const payment = await getPaymentsCollection().findOne({
        _id: new ObjectId(paymentId),
        userId: new ObjectId(userId),
        checkoutSessionId: session.id,
    });

    if (
        !payment ||
        payment.role !== role ||
        payment.plan !== plan ||
        session.client_reference_id !== userId
    ) {
        throw new Error("Stripe payment record validation failed");
    }

    return payment;
};

const completePayment = async (session, eventId) => {
    if (
        session.mode !== "payment" ||
        session.payment_status !== "paid"
    ) {
        return;
    }

    const payment = await getPaymentFromSession(session);

    const expectedPlan = plans[payment.role];

    if (
        !expectedPlan ||
        payment.plan !== "pro" ||
        payment.amount !== expectedPlan.amount ||
        session.amount_total !== expectedPlan.amount ||
        payment.currency !== "usd" ||
        session.currency !== "usd"
    ) {
        throw new Error("Stripe payment amount or currency mismatch");
    }

    if (payment.status === "paid") {
        return;
    }

    const users = getDB().collection("users");

    const user = await users.findOne({
        _id: payment.userId,
        role: payment.role,
    });

    if (!user) {
        throw new Error("Payment user not found");
    }

    const paidAt = new Date();

    await users.updateOne(
        {
            _id: payment.userId,
            role: payment.role,
        },
        {
            $set: {
                plan: "pro",
                planActivatedAt: paidAt,
                updatedAt: paidAt,
            },
        }
    );

    const paymentIntentId =
        typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

    const paymentUpdate = {
        status: "paid",
        paidAt,
        stripeEventId: eventId,
        updatedAt: paidAt,
    };

    if (paymentIntentId) {
        paymentUpdate.paymentIntentId = paymentIntentId;
    }

    await getPaymentsCollection().updateOne(
        {
            _id: payment._id,
            status: { $ne: "paid" },
        },
        {
            $set: paymentUpdate,
        }
    );
};

const updatePaymentStatus = async (
    session,
    status,
    eventId
) => {
    const payment = await getPaymentFromSession(session);

    if (payment.status === "paid") {
        return;
    }

    await getPaymentsCollection().updateOne(
        {
            _id: payment._id,
            status: { $ne: "paid" },
        },
        {
            $set: {
                status,
                stripeEventId: eventId,
                updatedAt: new Date(),
            },
        }
    );
};

router.post("/webhook", async (req, res) => {
    let event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Stripe webhook secret is not configured",
            });
        }

        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({
                success: false,
                message: "Invalid webhook request body",
            });
        }

        const stripe = getStripe();

        event = stripe.webhooks.constructEvent(
            req.body,
            req.headers["stripe-signature"],
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error(
            "Stripe webhook verification error:",
            error.message
        );

        return res.status(400).json({
            success: false,
            message: "Invalid Stripe webhook signature",
        });
    }

    try {
        const session = event.data.object;

        switch (event.type) {
            case "checkout.session.completed":
            case "checkout.session.async_payment_succeeded":
                await completePayment(session, event.id);
                break;

            case "checkout.session.async_payment_failed":
                await updatePaymentStatus(
                    session,
                    "failed",
                    event.id
                );
                break;

            case "checkout.session.expired":
                await updatePaymentStatus(
                    session,
                    "expired",
                    event.id
                );
                break;

            default:
                break;
        }

        return res.status(200).json({
            success: true,
            received: true,
        });
    } catch (error) {
        console.error("Stripe webhook processing error:", error);

        return res.status(500).json({
            success: false,
            message: "Webhook processing failed",
        });
    }
});

router.use(verifyToken);

router.post("/checkout-session", async (req, res) => {
    let createdPaymentId = null;

    try {
        const userIdString = req.user.userId;

        if (!ObjectId.isValid(userIdString)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID",
            });
        }

        if (req.body?.plan !== "pro") {
            return res.status(400).json({
                success: false,
                message: "Only the Pro plan is available for payment",
            });
        }

        const userId = new ObjectId(userIdString);
        const users = getDB().collection("users");

        const user = await users.findOne({
            _id: userId,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!["student", "tutor"].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: "Only students and tutors can purchase Pro",
            });
        }

        if (user.plan === "pro") {
            return res.status(409).json({
                success: false,
                message: "Your Pro membership is already active",
            });
        }

        const selectedPlan = plans[user.role];

        const stripe = getStripe();
        const payments = getPaymentsCollection();

        const existingPayment = await payments.findOne(
            {
                userId,
                status: "pending",
            },
            {
                sort: {
                    createdAt: -1,
                },
            }
        );

        if (existingPayment) {
            if (!existingPayment.checkoutSessionId) {
                return res.status(409).json({
                    success: false,
                    message: "A payment session is already being created",
                });
            }

            const existingSession =
                await stripe.checkout.sessions.retrieve(
                    existingPayment.checkoutSessionId
                );

            if (
                existingSession.status === "open" &&
                existingSession.url
            ) {
                return res.status(200).json({
                    success: true,
                    message: "Existing checkout session retrieved",
                    data: {
                        checkoutUrl: existingSession.url,
                        sessionId: existingSession.id,
                    },
                });
            }

            if (existingSession.status === "complete") {
                return res.status(409).json({
                    success: false,
                    message: "Payment confirmation is being processed",
                });
            }

            if (existingSession.status === "expired") {
                await payments.updateOne(
                    {
                        _id: existingPayment._id,
                    },
                    {
                        $set: {
                            status: "expired",
                            updatedAt: new Date(),
                        },
                    }
                );
            }
        }

        const payment = {
            userId,
            userEmail: user.email,
            role: user.role,
            plan: "pro",
            amount: selectedPlan.amount,
            currency: "usd",
            provider: "stripe",
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const insertResult = await payments.insertOne(payment);
        createdPaymentId = insertResult.insertedId;

        const clientUrl = (
            process.env.CLIENT_URL || "http://localhost:3000"
        ).replace(/\/+$/, "");

        const metadata = {
            paymentId: createdPaymentId.toString(),
            userId: userIdString,
            role: user.role,
            plan: "pro",
        };

        const session = await stripe.checkout.sessions.create(
            {
                mode: "payment",
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: {
                                name: selectedPlan.productName,
                            },
                            unit_amount: selectedPlan.amount,
                        },
                        quantity: 1,
                    },
                ],
                customer_email: user.email,
                client_reference_id: userIdString,
                metadata,
                payment_intent_data: {
                    metadata,
                },
                success_url:
                    `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${clientUrl}/payment/cancel`,
            },
            {
                idempotencyKey:
                    `mentorlagbe-${createdPaymentId.toString()}`,
            }
        );

        await payments.updateOne(
            {
                _id: createdPaymentId,
            },
            {
                $set: {
                    checkoutSessionId: session.id,
                    updatedAt: new Date(),
                },
            }
        );

        return res.status(201).json({
            success: true,
            message: "Stripe checkout session created successfully",
            data: {
                checkoutUrl: session.url,
                sessionId: session.id,
            },
        });
    } catch (error) {
        if (createdPaymentId) {
            await getPaymentsCollection().updateOne(
                {
                    _id: createdPaymentId,
                    status: "pending",
                },
                {
                    $set: {
                        status: "failed",
                        updatedAt: new Date(),
                    },
                }
            ).catch(() => {});
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A pending payment already exists",
            });
        }

        console.error("Create checkout session error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create Stripe checkout session",
        });
    }
});

router.get("/my", async (req, res) => {
    try {
        const userId = new ObjectId(req.user.userId);

        const payments = await getPaymentsCollection()
            .find({ userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();

        return res.status(200).json({
            success: true,
            data: payments.map(formatPayment),
        });
    } catch (error) {
        console.error("Get payment history error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment history",
        });
    }
});

router.get("/session/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (
            typeof sessionId !== "string" ||
            sessionId.length > 200
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid checkout session ID",
            });
        }

        const payment = await getPaymentsCollection().findOne({
            userId: new ObjectId(req.user.userId),
            checkoutSessionId: sessionId,
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: formatPayment(payment),
        });
    } catch (error) {
        console.error("Get payment status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve payment status",
        });
    }
});

module.exports = router;
