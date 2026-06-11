"use server";

import aj from "@/lib/arcjet";
import { db } from "@/lib/prisma";
import { request } from "@arcjet/next";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const serializeAmount = (obj) => ({
  ...obj,
  amount: obj.amount.toNumber(),
});

export async function createTransaction(data) {
    try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    // arcjet to add rate limiting 
    const req = await request();
    // check rate limit 
    const decision = await aj.protect(req, {
        userId,
        requested: 1, // specify how many tokens to consume 
    });


    if(decision.isDenied()){
        if(decision.reason.isRateLimit()){
            const { remaining, reset } = decision.reason;
            console.error({
                code: "RATE_LIMIT_EXCEEDED",
                details: {
                    remaining,
                    resetInSeconds: reset,
                },
            });

            throw new Error("Too many requests. Please try again later."); 
        }
        throw new Error("Request Blocked");
    }

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }  
    
    const account = await db.account.findUnique({
      where: {
        id: data.accountId,
        userId: user.id,
      },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    // Calculate new balance
    const balanceChange = data.type === "EXPENSE" ? -data.amount : data.amount;
    const newBalance = account.balance.toNumber() + balanceChange;

    const transaction = await db.$transaction(async (tx) =>{
      const newTransaction = await tx.transaction.create({
        data: {
          ...data,
          userId: user.id,
          nextRecurringDate:
            data.isRecurring && data.recurringInterval
              ? calculateNextRecurringDate(data.date, data.recurringInterval)
              : null,
        },
      });

      await tx.account.update({
        where: { id: data.accountId },
        data: { balance: newBalance },
      });

      return newTransaction;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${transaction.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
    } catch (error) {
        throw new Error(error.message);
    }
}

//Helper function to calculate next recurring date
function calculateNextRecurringDate(startDate, interval){
    const date = new Date(startDate);

    switch(interval){
        case "DAILY":
            date.setDate(date.getDate() + 1);
            break;
        case "WEEKLY":
            date.setDate(date.getDate() + 7);
            break;
        case "MONTHLY":
            date.setMonth(date.getMonth() + 1);
            break;
        case "YEARLY":
            date.setFullYear(date.getFullYear() + 1);
            break;
    }

    return date;
}

export async function scanReceipt(file){
  // 🔎 DEBUG START
  // console.log("==== scanReceipt called ====");
  // console.log("file:", file);
  // console.log("typeof file:", typeof file);
  // console.log("file instanceof File:", file instanceof File);
  // console.log("file?.type:", file?.type);
  // console.log("file?.name:", file?.name);
  // console.log("file?.size:", file?.size);
  // console.log("has arrayBuffer:", typeof file?.arrayBuffer === "function");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    // Convert ArrayBuffer to Base64
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `
      Analyze this receipt image and extract the following information in JSON format:
      CURRENCY LOGIC:
      1. If the receipt amount is in USD ($), convert it to INR (Indian Rupees) using an exchange rate of 1 USD = 83 INR.
      2. If the receipt amount is already in INR (₹), extract it as is.
      3. Final "amount" in the JSON must be a number representing Indian Rupees (INR).

      - Total amount (just the number)
      - Determine if it is INCOME (money received) or an EXPENSE (money spent).
      - Date (in ISO format)
      - Description or items purchased (brief summary)
      - Merchant/store name
      - Suggested category: 
          If EXPENSE, pick from: [housing, transportation, groceries, utilities, entertainment, food, shopping, healthcare, education, personal, travel, insurance, gifts and donation, bills, other-expense]
          If INCOME, pick from: [salary, freelance, investments, business, rental, other-income]
      
      Only respond with valid JSON in this exact format:
      {
        "type": "EXPENSE" | "INCOME",
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }

      If its not a receipt, return an empty object
    `;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      },
      prompt,
    ]); 

    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    try {
      const data = JSON.parse(cleanedText);

      // 🔎 LOG THIS IN YOUR TERMINAL
      console.log("--- AI DECISION ---");
      console.log("Detected Type:", data.type);
      console.log("Suggested Category:", data.category);

      // console.log("--- PARSED DATA ---");
      // console.log("Category extracted:", data.category);
      // console.log("Merchant:", data.merchantName);

      return {
        type: data.type,
        amount: parseFloat(data.amount),
        date: new Date(data.date),
        description: data.description,
        category: data.category,
        merchantName: data.merchantName,
      };
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      throw new Error("Invalid response format from Gemini");
    }    
  } catch (error) {
    console.error("Error scanning receipt:", error.message);
    throw new Error("Failed to scan receipt");
  }
}

export async function getTransaction(id) {

  const { userId } = await auth();
            if (!userId) throw new Error("Unauthorized");
        
            const user = await db.user.findUnique({
                where: {clerkUserId: userId},
            });
        if(!user) {
        throw new Error("User not found");
    }

  const transaction = await db.transaction.findUnique({
    where: {
      id,
      userId: user.id,
    },
  });

  if (!transaction) throw new Error("Transaction not found");

  return serializeAmount(transaction);
  

}



export async function updateTransaction(id, data) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) throw new Error("User not found");

    // Get original transaction to calculate balance change
    const originalTransaction = await db.transaction.findUnique({
      where: {
        id,
        userId: user.id,
      },
      include: {
        account: true,
      },
    });

    if (!originalTransaction) throw new Error("Transaction not found");

    // Calculate balance changes
    const oldBalanceChange =
      originalTransaction.type === "EXPENSE"
        ? -originalTransaction.amount.toNumber()
        : originalTransaction.amount.toNumber();

    const newBalanceChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const netBalanceChange = newBalanceChange - oldBalanceChange;

    // Update transaction and account balance in a transaction
    const transaction = await db.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: {
          id,
          userId: user.id,
        },
        data: {
          ...data,
          nextRecurringDate:
            data.isRecurring && data.recurringInterval
              ? calculateNextRecurringDate(data.date, data.recurringInterval)
              : null,
        },
      });

      // Update account balance
      await tx.account.update({
        where: { id: data.accountId },
        data: {
          balance: {
            increment: netBalanceChange,
          },
        },
      });

      return updated;
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${data.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    throw new Error(error.message);
  }
}