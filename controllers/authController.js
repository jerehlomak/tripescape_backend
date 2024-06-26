const User = require("../models/User");
const Token = require("../models/Token");
const { StatusCodes } = require("http-status-codes");
const CustomError = require("../errors");
const {
  createTokenUser,
  attachCookiesToResponse,
  sendVerificationEmail,
  sendResetPasswordEmail,
  createHash
} = require("../utils");
const crypto = require("crypto");

const register = async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body;

  const emailAlreadyExists = await User.findOne({ email });
  if (emailAlreadyExists) {
    throw new CustomError.BadRequestError("Email already exists");
  }

  const isFirstAccount = (await User.countDocuments({})) === 0;
  const role = isFirstAccount ? "admin" : "user";

  const verificationToken = crypto.randomBytes(40).toString("hex");

  const user = await User.create({ 
    firstName,
    lastName,
    email,
    password,
    phone,
    role,
    verificationToken,
  });

  const origin = 'http://localhost:3000'

  // console.log(req)

  await sendVerificationEmail({ name: user.firstName, email: user.email, verificationToken: user.verificationToken, origin });
  // const tokenUser = createTokenUser(user)
  // attachCookiesToResponse({ res, user: tokenUser })

  // send verification token only while working in postman
  res
    .status(StatusCodes.CREATED)
    .json({ email, msg: "Success! Please check your email to verify account" });
};

const verifyEmail = async (req, res) => {
  const { email, verificationToken } = req.body;
  // find user with this specific email
  const user = await User.findOne({ email });
  if (!user) {
    throw new CustomError.UnauthenticatedError("Verification Failed");
  }
  // check verification token
  if (user.verificationToken !== verificationToken) {
    throw new CustomError.UnauthenticatedError("Verification Failed");
  }

  user.isVerified = true;
  // set verified to Date.now()
  user.verified = Date.now();
  user.verificationToken = "";

  // save user using instance
  await user.save();
 
  res.status(StatusCodes.OK).json({ msg: "Email Verified" });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new CustomError.BadRequestError("Please provide email and password");
  }
  const user = await User.findOne({ email });
  // if user is not registered throw error
  if (!user) {
    throw new CustomError.UnauthenticatedError("Invalid Credentials");
  }
  // compare password for register and login
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new CustomError.UnauthenticatedError("Invalid Password");
  }
  // verify user account before login
  if (!user.isVerified) {
    throw new CustomError.UnauthenticatedError("Please Verify your email");
  }

  // compare password
  const token = user.createJWT();

  res.status(StatusCodes.OK).json({
    user: {
      email: user.email,
      lastName: user.lastName,
      firstName: user.firstName,
      token,
    },
  });
};

const loginuser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new CustomError.BadRequestError("Please provide email and password");
  }
  const user = await User.findOne({ email });
  // if user is not registered throw error
  if (!user) {
    throw new CustomError.UnauthenticatedError("Invalid Credentials");
  }
  // compare password for register and login
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new CustomError.UnauthenticatedError("Invalid Password");
  }
  // verify user account before login
  if (!user.isVerified) {
    throw new CustomError.UnauthenticatedError("Please Verify your email");
  }

  const tokenUser = createTokenUser(user);

  // create refresh token
  let refreshToken = ''

  // check for existing token
  const existingToken = await Token.findOne({ user: user._id })

  // change isvalid to false for users that are trespassing
  if (existingToken) {
    const { isValid } = existingToken
    if (!isValid) {
      throw new CustomError.UnauthenticatedError("Invalid Credentials");
    }
    refreshToken = existingToken.refreshToken
    attachCookiesToResponse({ res, user: tokenUser, refreshToken });

    res.status(StatusCodes.OK).json({ user: tokenUser });
    return
   }
    // set up the Token model
  refreshToken = crypto.randomBytes(40).toString('hex')
  const userAgent = req.headers['user-agent']
  const ip = req.ip
  const userToken = { refreshToken, ip, userAgent, user: user._id }

  const token =  await Token.create(userToken)

  attachCookiesToResponse({ res, user: tokenUser, refreshToken });

  res.status(StatusCodes.OK).json({ users: tokenUser });
};

const logout = async (req, res) => {
  await Token.findOneAndDelete({ user: req.user.userId })

  res.cookie("accessToken", "logout", {
    httpOnly: true,
    expires: new Date(Date.now()),
  });
  res.cookie("refreshToken", "logout", {
    httpOnly: true,
    expires: new Date(Date.now()),
  });

  res.status(StatusCodes.OK).json({ msg: "user logged out" });
};

// forgot password
const forgotPassword = async (req, res) => {
  const { email } = req.body
  if (!email) {
    throw new CustomError.UnauthenticatedError('Email does not exist')
  }
  const user = await User.findOne({ email })

  if (user) {
    const passwordToken = crypto.randomBytes(70).toString('hex')

    // send email
    const origin = 'http://localhost:3000'
    await sendResetPasswordEmail({
      name: user.firstName,
      email: user.email,
      token: passwordToken,
      origin, 
    })
    //set expiration
    const tenMinutes = 1000 * 60 * 10
    const passwordTokenExpirationDate = new Date(Date.now() + tenMinutes)

    user.passwordToken = passwordToken
    user.passwordTokenExpirationDate = passwordTokenExpirationDate
    await user.save()
  }

  res.status(StatusCodes.OK).json({ msg: 'Please check your email for reset password link' })
}
 
// reset password
const resetPassword = async (req, res) => {
  const { token, email, password } = req.body
  if(!token || !email || !password) {
    throw new CustomError.BadRequestError('Please provide all values')
  }
  const user = await User.findOne({ email })

  if (user) {
    const currentDate = new Date()

    if (user.passwordToken === token && user.passwordTokenExpirationDate > currentDate) {
      user.password = password
      user.passwordToken = null
      user.passwordTokenExpirationDate = null
      await user.save()
    }
  }
   res.status(StatusCodes.OK).json({ msg: 'Password reset Successful' })
}

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword
};
