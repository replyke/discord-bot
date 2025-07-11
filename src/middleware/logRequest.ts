import { Request as ExReq, Response as ExRes, NextFunction } from "express";

const logRequest = (req: ExReq, _: ExRes, next: NextFunction) => {
  let logString = `New request: ${req.method} ${req.path}`;
  console.log(logString);
  next(); // Pass control to the next middleware or route handler
};

export default logRequest;
